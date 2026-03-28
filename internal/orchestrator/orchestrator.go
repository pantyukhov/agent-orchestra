package orchestrator

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/pavelpantiukhov/agent-orchestra/internal/action"
	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/event"
	"github.com/pavelpantiukhov/agent-orchestra/internal/pipeline"
	"github.com/pavelpantiukhov/agent-orchestra/internal/state"
	"github.com/pavelpantiukhov/agent-orchestra/internal/tmpl"
	"github.com/pavelpantiukhov/agent-orchestra/internal/trigger"
)

type Orchestrator struct {
	Config   *config.OrchestratorConfig
	State    *state.State
	Triggers []trigger.Trigger
	Actions  *action.Runner
	GitLab   *trigger.GitLabClient
	Logger   *slog.Logger
}

func New(cfg *config.OrchestratorConfig, logger *slog.Logger) *Orchestrator {
	projectRoot := cfg.ProjectRoot
	if projectRoot == "" {
		projectRoot = "."
	}

	// Determine GitLab URL from first trigger
	var gitlabURL string
	var gitlabProject string
	for _, t := range cfg.Triggers {
		if t.GitLab.URL != "" {
			gitlabURL = t.GitLab.URL
		}
		if gitlabProject == "" {
			gitlabProject = t.GitLab.Project
		}
	}

	gitlabClient := trigger.NewGitLabClient(gitlabURL, "", logger)

	statePath := cfg.Persistence.File
	if statePath == "" {
		statePath = ".agent-orchestra.state.json"
	}
	st := state.NewState(statePath)

	actionsRunner := action.NewRunner(projectRoot, gitlabProject, gitlabClient, logger)

	// Build triggers
	var triggers []trigger.Trigger
	for _, tc := range cfg.Triggers {
		switch tc.Type {
		case "gitlab-issues":
			triggers = append(triggers, trigger.NewGitLabIssuesTrigger(tc, gitlabClient, st, logger))
		case "gitlab-ci":
			triggers = append(triggers, trigger.NewGitLabCITrigger(tc, gitlabClient, st, logger))
		}
	}

	return &Orchestrator{
		Config:   cfg,
		State:    st,
		Triggers: triggers,
		Actions:  actionsRunner,
		GitLab:   gitlabClient,
		Logger:   logger,
	}
}

// Run starts the event loop. Polls triggers, processes events, repeats.
func (o *Orchestrator) Run(ctx context.Context) error {
	o.Logger.Info("starting orchestrator",
		"name", o.Config.Name,
		"triggers", len(o.Triggers),
		"pipelines", len(o.Config.Pipelines),
		"max_concurrent", o.Config.Concurrency.Max,
	)

	o.State.CleanStaleLocks()

	// Find the shortest poll interval
	pollInterval := 2 * time.Minute
	for _, tc := range o.Config.Triggers {
		if tc.PollInterval != "" {
			d := config.ParseDuration(tc.PollInterval, 2*time.Minute)
			if d < pollInterval {
				pollInterval = d
			}
		}
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		o.poll(ctx)
		o.State.BumpPollCount()

		o.Logger.Info("next poll", "in", pollInterval)
		select {
		case <-time.After(pollInterval):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// RunOnce polls all triggers once and processes events.
func (o *Orchestrator) RunOnce(ctx context.Context) error {
	o.State.CleanStaleLocks()
	o.poll(ctx)
	return nil
}

func (o *Orchestrator) poll(ctx context.Context) {
	var allEvents []event.Event
	for _, t := range o.Triggers {
		if ctx.Err() != nil {
			return
		}

		events, err := t.Poll(ctx)
		if err != nil {
			o.Logger.Error("trigger poll failed", "trigger", t.Name(), "error", err)
			continue
		}
		allEvents = append(allEvents, events...)
	}

	if len(allEvents) == 0 {
		o.Logger.Info("no events")
		return
	}

	event.SortByPriority(allEvents)

	o.Logger.Info("processing events", "count", len(allEvents))

	for _, ev := range allEvents {
		if ctx.Err() != nil {
			return
		}

		if o.State.ActiveCount() >= o.Config.Concurrency.Max {
			o.Logger.Info("max concurrent reached, deferring remaining events",
				"active", o.State.ActiveCount(), "max", o.Config.Concurrency.Max)
			break
		}

		o.processEvent(ctx, ev)
	}
}

func (o *Orchestrator) processEvent(ctx context.Context, ev event.Event) {
	pipelineDef, ok := o.Config.Pipelines[ev.Pipeline]
	if !ok {
		o.Logger.Error("pipeline not found", "pipeline", ev.Pipeline, "event", ev.ID)
		return
	}

	logger := o.taskLogger(ev)
	logger.Info("processing event",
		"event_id", ev.ID,
		"type", ev.Type,
		"pipeline", ev.Pipeline,
		"data", ev.Data,
	)

	// Lock the event
	if err := o.State.Lock(ev.ID, ev.Pipeline); err != nil {
		logger.Error("failed to lock event", "error", err)
		return
	}

	// Apply state transition: on_start
	o.applyTransition(ctx, ev, pipelineDef.State.OnStart)

	// Render templates in steps
	renderedSteps, err := tmpl.RenderSteps(pipelineDef.Steps, ev.Data)
	if err != nil {
		logger.Error("template rendering failed", "error", err)
		o.applyTransition(ctx, ev, pipelineDef.State.OnFailure)
		o.State.Unlock(ev.ID)
		return
	}

	// Build and run pipeline
	p := &pipeline.Pipeline{
		Name:     fmt.Sprintf("%s/%s", ev.Pipeline, ev.ID),
		Steps:    renderedSteps,
		Defaults: o.Config.Defaults,
		Loop:     config.LoopConfig{Count: 1},
		Logger:   logger,
		Actions:  o.Actions,
	}

	if err := p.Run(ctx); err != nil {
		logger.Error("pipeline failed", "error", err)
		o.applyTransition(ctx, ev, pipelineDef.State.OnFailure)
		o.State.Unlock(ev.ID)
		return
	}

	// Apply state transition: on_success
	o.applyTransition(ctx, ev, pipelineDef.State.OnSuccess)
	o.State.Unlock(ev.ID)

	logger.Info("event processed successfully", "event_id", ev.ID)
}

func (o *Orchestrator) applyTransition(ctx context.Context, ev event.Event, transition config.StateTransition) {
	project := ev.Data["project"]
	issueIID := ev.Data["issue_iid"]

	if project == "" || issueIID == "" {
		return
	}

	if len(transition.RemoveLabels) > 0 || len(transition.AddLabels) > 0 {
		if err := o.GitLab.TransitionLabels(ctx, project, issueIID, transition.RemoveLabels, transition.AddLabels); err != nil {
			o.Logger.Error("label transition failed", "error", err)
		}
	}

	if transition.CloseIssue {
		if err := o.GitLab.CloseIssue(ctx, project, issueIID); err != nil {
			o.Logger.Error("close issue failed", "error", err)
		}
	}
}

func (o *Orchestrator) taskLogger(ev event.Event) *slog.Logger {
	if o.Config.Logging.Dir == "" || !o.Config.Logging.PerTask {
		return o.Logger
	}

	logDir := o.Config.Logging.Dir
	os.MkdirAll(logDir, 0755)

	logFile := filepath.Join(logDir,
		fmt.Sprintf("%s-%s.log", ev.ID, time.Now().Format("20060102-150405")))

	f, err := os.Create(logFile)
	if err != nil {
		o.Logger.Error("failed to create task log", "file", logFile, "error", err)
		return o.Logger
	}

	w := io.MultiWriter(os.Stderr, f)
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
