package pipeline

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

var testLogger = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

func newPipeline(cfg *config.PipelineConfig) *Pipeline {
	return NewFromConfig(cfg, testLogger)
}

func TestSimpleRun(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "echo1", Command: "echo", Args: []string{"step1"}, OnError: "stop"},
			{Name: "echo2", Command: "echo", Args: []string{"step2"}, OnError: "stop"},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWithGlobalDefaults(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name:     "test-defaults",
		Defaults: config.DefaultsConfig{Command: "echo", Args: []string{"-n"}},
		Loop:     config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "step1", Prompt: "hello"},
			{Name: "step2", Prompt: "world"},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestOverrideDefaults(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name:     "test-override",
		Defaults: config.DefaultsConfig{Command: "false"},
		Loop:     config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "override", Command: "echo", Args: []string{"overridden"}, OnError: "stop"},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStepLoop(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test-step-loop",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{
				Name: "repeat", Command: "echo", Args: []string{"looping"}, OnError: "stop",
				Loop: config.LoopConfig{Count: 3, Delay: "10ms"},
			},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGroupLoop(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test-group-loop",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{
				Group: "dev-review",
				Loop:  config.LoopConfig{Count: 3, Delay: "10ms"},
				Steps: []config.StepConfig{
					{Name: "develop", Command: "echo", Args: []string{"coding..."}, OnError: "stop"},
					{Name: "review", Command: "echo", Args: []string{"reviewing..."}, OnError: "stop"},
				},
			},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestOnErrorStop(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test-stop",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "fail", Command: "false", OnError: "stop"},
			{Name: "should-not-run", Command: "echo", Args: []string{"unreachable"}, OnError: "stop"},
		},
	})
	if err := p.Run(context.Background()); err == nil {
		t.Error("expected error when agent fails with on_error=stop")
	}
}

func TestOnErrorContinue(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test-continue",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "fail", Command: "false", OnError: "continue"},
			{Name: "success", Command: "echo", Args: []string{"still running"}, OnError: "stop"},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("pipeline should continue past failure: %v", err)
	}
}

func TestOnErrorRetry(t *testing.T) {
	p := newPipeline(&config.PipelineConfig{
		Name: "test-retry",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "fail-retry", Command: "false", OnError: "retry", RetryCount: 2, RetryDelay: "10ms"},
		},
	})
	if err := p.Run(context.Background()); err == nil {
		t.Error("expected error after retries exhausted")
	}
}

func TestContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	p := newPipeline(&config.PipelineConfig{
		Name: "test-cancel",
		Loop: config.LoopConfig{Count: 0},
		Steps: []config.StepConfig{
			{Name: "echo", Command: "echo", Args: []string{"hello"}, OnError: "stop"},
		},
	})
	if err := p.Run(ctx); err == nil {
		t.Error("expected error from cancelled context")
	}
}
