package pipeline

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/pavelpantiukhov/agent-orchestra/internal/action"
	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/history"
	"github.com/pavelpantiukhov/agent-orchestra/internal/runner"
	"github.com/pavelpantiukhov/agent-orchestra/internal/tmpl"
)

// ErrNeedsHuman is returned when a stop label is detected, indicating the agent
// requested human input and the pipeline should stop gracefully.
var ErrNeedsHuman = errors.New("pipeline stopped: agent requested human input")

// LabelChecker is an interface for fetching issue labels, so that the pipeline
// package does not depend on the trigger package directly.
type LabelChecker interface {
	GetIssueLabels(ctx context.Context, project, iid string) ([]string, error)
}

type Pipeline struct {
	Name       string
	Steps      []config.StepConfig
	Defaults   config.DefaultsConfig
	Loop       config.LoopConfig
	Logger     *slog.Logger
	Actions    *action.Runner           // optional, for built-in action steps
	Data       map[string]interface{}   // template data (event data + step outputs)
	StopLabels []string                 // labels that stop the pipeline (e.g. "ai:needs-human")
	GitLab     LabelChecker             // optional, for checking stop labels
	Project    string                   // GitLab project path (for label checks)
	IssueIID   string                   // GitLab issue IID (for label checks)
	History    *history.Store           // optional, for recording run history
	ConfigPath string                   // config file path (for history)

	currentRun *history.RunRecord // current run record (internal)
}

// NewFromConfig creates a pipeline from a PipelineConfig (simple mode).
func NewFromConfig(cfg *config.PipelineConfig, logger *slog.Logger) *Pipeline {
	return &Pipeline{
		Name:     cfg.Name,
		Steps:    cfg.Steps,
		Defaults: cfg.Defaults,
		Loop:     cfg.Loop,
		Logger:   logger,
	}
}

func (p *Pipeline) Run(ctx context.Context) error {
	// Pre-populate step entries so templates can reference outputs before they run
	if p.Data != nil {
		tmpl.EnsureStepEntries(p.Data, p.Steps)
	}

	// Start history record
	var run *history.RunRecord
	if p.History != nil {
		var err error
		run, err = p.History.Start(p.Name, p.ConfigPath)
		if err != nil {
			p.Logger.Warn("failed to start history record", "error", err)
		} else {
			// Record SSH/tmux info
			if p.Defaults.SSH != nil {
				run.SSH = &history.SSHInfo{
					Host: p.Defaults.SSH.Host,
					User: p.Defaults.SSH.User,
					Port: p.Defaults.SSH.Port,
				}
				if p.Defaults.SSH.Tmux != nil {
					session := p.Defaults.SSH.Tmux.Session
					if session == "" {
						session = p.Name
					}
					session = fmt.Sprintf("%s-%s", session, time.Now().Format("20060102-150405"))
					logDir := p.Defaults.SSH.Tmux.LogDir
					if logDir == "" {
						logDir = "/tmp/agent-orchestra"
					}
					ttl := p.Defaults.SSH.Tmux.TTL
					if ttl == "" {
						ttl = "72h"
					}
					run.Tmux = &history.TmuxInfo{
						Session: session,
						LogFile: fmt.Sprintf("%s/%s.log", logDir, session),
						TTL:     ttl,
						Attach:  fmt.Sprintf("ssh %s@%s -t 'tmux attach -t %s'", p.Defaults.SSH.User, p.Defaults.SSH.Host, session),
					}
					_ = p.History.Finish(run, nil) // persist tmux info immediately
					run.Status = "running"
				}
			}
		}
	}
	p.currentRun = run

	loopDelay := config.ParseDuration(p.Loop.Delay, 0)
	count := p.Loop.Count

	var runErr error
	for iteration := 1; count == 0 || iteration <= count; iteration++ {
		if ctx.Err() != nil {
			runErr = ctx.Err()
			break
		}

		p.Logger.Info("starting iteration", "iteration", iteration, "pipeline", p.Name)

		if err := p.runSteps(ctx, p.Steps); err != nil {
			runErr = err
			break
		}

		p.Logger.Info("iteration complete", "iteration", iteration)

		if loopDelay > 0 && (count == 0 || iteration < count) {
			p.Logger.Info("waiting before next iteration", "delay", loopDelay)
			select {
			case <-time.After(loopDelay):
			case <-ctx.Done():
				runErr = ctx.Err()
			}
		}
	}

	// Finish history record
	if p.History != nil && run != nil {
		if ctx.Err() == context.Canceled {
			_ = p.History.Cancel(run)
		} else {
			_ = p.History.Finish(run, runErr)
		}
	}

	return runErr
}

func (p *Pipeline) runSteps(ctx context.Context, steps []config.StepConfig) error {
	for _, step := range steps {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Render templates just-in-time with current data (includes step outputs)
		rendered, err := p.renderStep(step)
		if err != nil {
			return fmt.Errorf("template render for %q: %w", step.Label(), err)
		}

		if rendered.IsGroup() {
			if err := p.runGroup(ctx, rendered); err != nil {
				return err
			}
		} else if rendered.IsAction() {
			if err := p.runAction(ctx, rendered); err != nil {
				onError := rendered.ResolvedOnError(p.Defaults)
				if onError == "continue" {
					p.Logger.Warn("action failed, continuing", "action", rendered.Action, "error", err)
					continue
				}
				return fmt.Errorf("action %q failed: %w", rendered.Action, err)
			}
		} else {
			onError := rendered.ResolvedOnError(p.Defaults)
			result, runErr := p.runStepWithLoop(ctx, rendered)
			if runErr != nil {
				if onError == "continue" {
					p.Logger.Warn("agent failed, continuing", "agent", rendered.Name, "error", runErr)
					continue
				}
				return fmt.Errorf("agent %q failed: %w", rendered.Name, runErr)
			}

			// Store captured output for use by subsequent steps
			if step.CaptureOutput && result != nil && result.Output != "" {
				p.storeStepOutput(step.Name, result)
			}

			// Check stop labels after successful agent step
			if err := p.checkStopLabels(ctx); err != nil {
				return err
			}
		}
	}
	return nil
}

// checkStopLabels fetches the current issue labels and returns ErrNeedsHuman
// if any configured stop label is present. Returns nil if no stop labels are
// configured or if the label check fails (non-fatal).
func (p *Pipeline) checkStopLabels(ctx context.Context) error {
	if len(p.StopLabels) == 0 || p.GitLab == nil || p.Project == "" || p.IssueIID == "" {
		return nil
	}

	labels, err := p.GitLab.GetIssueLabels(ctx, p.Project, p.IssueIID)
	if err != nil {
		p.Logger.Warn("failed to check stop labels", "error", err)
		return nil // don't fail pipeline on label check error
	}

	labelSet := make(map[string]bool, len(labels))
	for _, l := range labels {
		labelSet[l] = true
	}

	for _, sl := range p.StopLabels {
		if labelSet[sl] {
			p.Logger.Info("stop label detected", "label", sl)
			return ErrNeedsHuman
		}
	}

	return nil
}

// renderStep renders a step with current pipeline data, if data is available.
func (p *Pipeline) renderStep(step config.StepConfig) (config.StepConfig, error) {
	if p.Data == nil {
		return step, nil
	}
	return tmpl.RenderStep(step, p.Data)
}

// storeStepOutput saves a step's captured output into p.Data for template access.
func (p *Pipeline) storeStepOutput(name string, result *runner.Result) {
	if p.Data == nil {
		p.Data = make(map[string]interface{})
	}

	stepsData, _ := p.Data["steps"].(map[string]interface{})
	if stepsData == nil {
		stepsData = make(map[string]interface{})
		p.Data["steps"] = stepsData
	}

	stepsData[name] = map[string]interface{}{
		"output":    result.Output,
		"exit_code": fmt.Sprintf("%d", result.ExitCode),
	}
}

// recordStep saves a step result to run history.
func (p *Pipeline) recordStep(name, status string, result *runner.Result) {
	if p.History == nil || p.currentRun == nil {
		return
	}
	sr := history.StepRecord{
		Name:   name,
		Status: status,
	}
	if result != nil {
		sr.ExitCode = result.ExitCode
		sr.Duration = result.Duration.Round(time.Millisecond).String()
		if result.Err != nil {
			sr.Error = result.Err.Error()
		}
		// Truncate output for history (keep first 4KB)
		if result.Output != "" {
			out := result.Output
			if len(out) > 4096 {
				out = out[:4096] + "\n... (truncated)"
			}
			sr.Output = out
		}
	}
	_ = p.History.AddStep(p.currentRun, sr)
}

func (p *Pipeline) runAction(ctx context.Context, step config.StepConfig) error {
	if p.Actions == nil {
		return fmt.Errorf("action %q: actions not available in simple pipeline mode", step.Action)
	}
	p.Logger.Info("running action", "action", step.Action)
	return p.Actions.Execute(ctx, step)
}

func (p *Pipeline) runGroup(ctx context.Context, group config.StepConfig) error {
	count := group.Loop.Count
	if count == 0 {
		count = 1
	}

	groupDelay := config.ParseDuration(group.Loop.Delay, 0)

	for i := 1; i <= count; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if group.Loop.Count > 1 {
			p.Logger.Info("group loop", "group", group.Group, "iteration", i, "of", count)
		} else {
			p.Logger.Info("running group", "group", group.Group)
		}

		if err := p.runSteps(ctx, group.Steps); err != nil {
			return err
		}

		if groupDelay > 0 && i < count {
			select {
			case <-time.After(groupDelay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return nil
}

func (p *Pipeline) runStepWithLoop(ctx context.Context, step config.StepConfig) (*runner.Result, error) {
	stepCount := step.Loop.Count
	if stepCount == 0 {
		return p.runAgent(ctx, step)
	}

	stepDelay := config.ParseDuration(step.Loop.Delay, 0)

	var lastResult *runner.Result
	for i := 1; i <= stepCount; i++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		p.Logger.Info("step loop", "agent", step.Name, "step_iteration", i, "of", stepCount)

		result, err := p.runAgent(ctx, step)
		if err != nil {
			return result, err
		}
		lastResult = result

		if stepDelay > 0 && i < stepCount {
			select {
			case <-time.After(stepDelay):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	}

	return lastResult, nil
}

func (p *Pipeline) runAgent(ctx context.Context, step config.StepConfig) (*runner.Result, error) {
	onError := step.ResolvedOnError(p.Defaults)

	retries := 1
	if onError == "retry" && step.RetryCount > 0 {
		retries = step.RetryCount
	}

	retryDelay := config.ParseDuration(step.RetryDelay, time.Second)

	cmd, args := step.ResolvedCommand(p.Defaults)

	var lastErr error
	var lastResult runner.Result
	for attempt := 1; attempt <= retries; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		if attempt > 1 {
			p.Logger.Info("retrying agent", "agent", step.Name, "attempt", attempt, "of", retries)
			select {
			case <-time.After(retryDelay):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		} else {
			p.Logger.Info("running agent", "agent", step.Name, "command", cmd, "args", args)
		}

		result := runner.Run(ctx, step, p.Defaults, p.Logger)
		lastResult = result
		if result.Err == nil {
			p.Logger.Info("agent completed", "agent", step.Name, "duration", result.Duration.Round(time.Millisecond))
			p.recordStep(step.Name, "success", &result)
			return &lastResult, nil
		}

		lastErr = result.Err
		p.Logger.Error("agent failed", "agent", step.Name, "error", result.Err, "exit_code", result.ExitCode, "duration", result.Duration.Round(time.Millisecond))
	}

	p.recordStep(step.Name, "failure", &lastResult)
	return &lastResult, lastErr
}
