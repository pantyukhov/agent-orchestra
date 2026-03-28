package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/runner"
)

type Pipeline struct {
	Config *config.PipelineConfig
	Logger *slog.Logger
}

func New(cfg *config.PipelineConfig, logger *slog.Logger) *Pipeline {
	return &Pipeline{Config: cfg, Logger: logger}
}

func (p *Pipeline) Run(ctx context.Context) error {
	loopDelay := config.ParseDuration(p.Config.Loop.Delay, 0)
	count := p.Config.Loop.Count

	for iteration := 1; count == 0 || iteration <= count; iteration++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		p.Logger.Info("starting iteration", "iteration", iteration, "pipeline", p.Config.Name)

		if err := p.runSteps(ctx, p.Config.Steps); err != nil {
			return err
		}

		p.Logger.Info("iteration complete", "iteration", iteration)

		if loopDelay > 0 && (count == 0 || iteration < count) {
			p.Logger.Info("waiting before next iteration", "delay", loopDelay)
			select {
			case <-time.After(loopDelay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return nil
}

// runSteps executes a list of steps (agents or groups) sequentially.
func (p *Pipeline) runSteps(ctx context.Context, steps []config.StepConfig) error {
	for _, step := range steps {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if step.IsGroup() {
			if err := p.runGroup(ctx, step); err != nil {
				return err
			}
		} else {
			onError := step.ResolvedOnError(p.Config.Defaults)
			if err := p.runStepWithLoop(ctx, step); err != nil {
				if onError == "continue" {
					p.Logger.Warn("agent failed, continuing", "agent", step.Name, "error", err)
					continue
				}
				return fmt.Errorf("agent %q failed: %w", step.Name, err)
			}
		}
	}
	return nil
}

// runGroup runs a group of agents, with optional group-level loop.
func (p *Pipeline) runGroup(ctx context.Context, group config.StepConfig) error {
	count := group.Loop.Count
	if count == 0 {
		// no loop — run group once
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

// runStepWithLoop handles step-level looping for a single agent.
func (p *Pipeline) runStepWithLoop(ctx context.Context, step config.StepConfig) error {
	stepCount := step.Loop.Count
	if stepCount == 0 {
		return p.runAgent(ctx, step)
	}

	stepDelay := config.ParseDuration(step.Loop.Delay, 0)

	for i := 1; i <= stepCount; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		p.Logger.Info("step loop", "agent", step.Name, "step_iteration", i, "of", stepCount)

		if err := p.runAgent(ctx, step); err != nil {
			return err
		}

		if stepDelay > 0 && i < stepCount {
			select {
			case <-time.After(stepDelay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return nil
}

func (p *Pipeline) runAgent(ctx context.Context, step config.StepConfig) error {
	onError := step.ResolvedOnError(p.Config.Defaults)

	retries := 1
	if onError == "retry" && step.RetryCount > 0 {
		retries = step.RetryCount
	}

	retryDelay := config.ParseDuration(step.RetryDelay, time.Second)

	cmd, args := step.ResolvedCommand(p.Config.Defaults)

	var lastErr error
	for attempt := 1; attempt <= retries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if attempt > 1 {
			p.Logger.Info("retrying agent", "agent", step.Name, "attempt", attempt, "of", retries)
			select {
			case <-time.After(retryDelay):
			case <-ctx.Done():
				return ctx.Err()
			}
		} else {
			p.Logger.Info("running agent", "agent", step.Name, "command", cmd, "args", args)
		}

		result := runner.Run(ctx, step, p.Config.Defaults, p.Logger)
		if result.Err == nil {
			p.Logger.Info("agent completed", "agent", step.Name, "duration", result.Duration.Round(time.Millisecond))
			return nil
		}

		lastErr = result.Err
		p.Logger.Error("agent failed", "agent", step.Name, "error", result.Err, "exit_code", result.ExitCode, "duration", result.Duration.Round(time.Millisecond))
	}

	return lastErr
}
