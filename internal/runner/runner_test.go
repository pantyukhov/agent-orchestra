package runner

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

var (
	testLogger   = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	emptyDefault = config.DefaultsConfig{}
)

func TestRun_Success(t *testing.T) {
	step := config.StepConfig{Name: "test-echo", Command: "echo", Args: []string{"hello"}}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
	if result.ExitCode != 0 {
		t.Errorf("expected exit code 0, got %d", result.ExitCode)
	}
}

func TestRun_WithDefaults(t *testing.T) {
	defaults := config.DefaultsConfig{Command: "echo", Args: []string{"from-defaults"}}
	step := config.StepConfig{Name: "test-defaults"}
	result := Run(context.Background(), step, defaults, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
}

func TestRun_OverrideDefaults(t *testing.T) {
	defaults := config.DefaultsConfig{Command: "false"}
	step := config.StepConfig{Name: "test-override", Command: "echo", Args: []string{"overridden"}}
	result := Run(context.Background(), step, defaults, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
}

func TestRun_PromptAppended(t *testing.T) {
	defaults := config.DefaultsConfig{Command: "echo", Args: []string{"-n"}}
	step := config.StepConfig{Name: "test-prompt", Prompt: "hello world"}
	result := Run(context.Background(), step, defaults, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
}

func TestRun_Failure(t *testing.T) {
	step := config.StepConfig{Name: "test-fail", Command: "false"}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err == nil {
		t.Error("expected error for failing command")
	}
	if result.ExitCode != 1 {
		t.Errorf("expected exit code 1, got %d", result.ExitCode)
	}
}

func TestRun_NotFound(t *testing.T) {
	step := config.StepConfig{Name: "test-notfound", Command: "nonexistent-command-xyz"}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err == nil {
		t.Error("expected error for nonexistent command")
	}
}

func TestRun_Timeout(t *testing.T) {
	step := config.StepConfig{Name: "test-timeout", Command: "sleep", Args: []string{"60"}, Timeout: "100ms"}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err == nil {
		t.Error("expected timeout error")
	}
}

func TestRun_ContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	step := config.StepConfig{Name: "test-cancel", Command: "sleep", Args: []string{"60"}}
	result := Run(ctx, step, emptyDefault, testLogger)
	if result.Err == nil {
		t.Error("expected error from cancelled context")
	}
}

func TestRun_EnvVars(t *testing.T) {
	step := config.StepConfig{
		Name:    "test-env",
		Command: "sh",
		Args:    []string{"-c", "echo $TEST_VAR"},
		Env:     map[string]string{"TEST_VAR": "hello"},
	}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
}

func TestRun_WorkingDir(t *testing.T) {
	step := config.StepConfig{
		Name:       "test-wd",
		Command:    "pwd",
		WorkingDir: "/tmp",
	}
	result := Run(context.Background(), step, emptyDefault, testLogger)
	if result.Err != nil {
		t.Fatalf("unexpected error: %v", result.Err)
	}
}
