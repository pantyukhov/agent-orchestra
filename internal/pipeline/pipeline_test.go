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

func TestCaptureOutputPassBetweenSteps(t *testing.T) {
	// Step 1 outputs "review-feedback", step 2 uses it via template
	p := &Pipeline{
		Name: "test-capture-pass",
		Steps: []config.StepConfig{
			{
				Name:          "review",
				Command:       "echo",
				Args:          []string{"found 3 bugs"},
				OnError:       "stop",
				CaptureOutput: true,
			},
			{
				Name:    "implement",
				Command: "echo",
				Args:    []string{"{{ .steps.review.output }}"},
				OnError: "stop",
			},
		},
		Defaults: config.DefaultsConfig{},
		Loop:     config.LoopConfig{Count: 1},
		Logger:   testLogger,
		Data:     make(map[string]interface{}),
	}

	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the output was stored
	stepsData, ok := p.Data["steps"].(map[string]interface{})
	if !ok {
		t.Fatal("expected steps data in pipeline Data")
	}
	reviewData, ok := stepsData["review"].(map[string]interface{})
	if !ok {
		t.Fatal("expected review data in steps")
	}
	output, ok := reviewData["output"].(string)
	if !ok || output != "found 3 bugs\n" {
		t.Errorf("expected 'found 3 bugs\\n', got %q", output)
	}
}

func TestCaptureOutputInGroupLoop(t *testing.T) {
	// In a group loop, step outputs should accumulate and be available
	p := &Pipeline{
		Name: "test-capture-group",
		Steps: []config.StepConfig{
			{
				Group: "cycle",
				Loop:  config.LoopConfig{Count: 2, Delay: "10ms"},
				Steps: []config.StepConfig{
					{
						Name:          "producer",
						Command:       "echo",
						Args:          []string{"output-data"},
						OnError:       "stop",
						CaptureOutput: true,
					},
					{
						Name:    "consumer",
						Command: "echo",
						Args:    []string{"got: {{ .steps.producer.output }}"},
						OnError: "stop",
					},
				},
			},
		},
		Defaults: config.DefaultsConfig{},
		Loop:     config.LoopConfig{Count: 1},
		Logger:   testLogger,
		Data:     make(map[string]interface{}),
	}

	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify output is stored
	stepsData := p.Data["steps"].(map[string]interface{})
	producerData := stepsData["producer"].(map[string]interface{})
	if producerData["output"] != "output-data\n" {
		t.Errorf("expected 'output-data\\n', got %q", producerData["output"])
	}
}

func TestNoCaptureOutputByDefault(t *testing.T) {
	p := &Pipeline{
		Name: "test-no-capture",
		Steps: []config.StepConfig{
			{
				Name:    "step1",
				Command: "echo",
				Args:    []string{"not captured"},
				OnError: "stop",
			},
		},
		Defaults: config.DefaultsConfig{},
		Loop:     config.LoopConfig{Count: 1},
		Logger:   testLogger,
		Data:     make(map[string]interface{}),
	}

	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Steps map exists (pre-populated by EnsureStepEntries) but output should be empty default
	stepsData, ok := p.Data["steps"].(map[string]interface{})
	if !ok {
		t.Fatal("expected steps map to exist (pre-populated)")
	}
	step1Data, ok := stepsData["step1"].(map[string]interface{})
	if !ok {
		t.Fatal("expected step1 entry to exist")
	}
	// Output should be the empty default, not captured data
	if step1Data["output"] != "" {
		t.Errorf("expected empty output when capture_output is false, got %q", step1Data["output"])
	}
}

func TestPipelineWithoutData(t *testing.T) {
	// Pipeline without Data field should work (backward compatibility)
	p := newPipeline(&config.PipelineConfig{
		Name: "test-no-data",
		Loop: config.LoopConfig{Count: 1},
		Steps: []config.StepConfig{
			{Name: "echo", Command: "echo", Args: []string{"hello"}, OnError: "stop"},
		},
	})
	if err := p.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
