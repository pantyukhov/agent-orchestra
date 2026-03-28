package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	yaml := `
pipeline:
  name: "test"
  defaults:
    command: "echo"
    args: ["-n"]
  loop:
    count: 2
    delay: "1s"
  steps:
    - name: "step1"
      prompt: "hello"
    - name: "step2"
      command: "date"
`
	path := filepath.Join(t.TempDir(), "test.yaml")
	os.WriteFile(path, []byte(yaml), 0644)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Pipeline.Name != "test" {
		t.Errorf("expected name 'test', got %q", cfg.Pipeline.Name)
	}
	if len(cfg.Pipeline.Steps) != 2 {
		t.Errorf("expected 2 steps, got %d", len(cfg.Pipeline.Steps))
	}
	if cfg.Pipeline.Defaults.Command != "echo" {
		t.Errorf("expected defaults.command 'echo', got %q", cfg.Pipeline.Defaults.Command)
	}
}

func TestLoadWithGroup(t *testing.T) {
	yaml := `
pipeline:
  name: "test-group"
  defaults:
    command: "echo"
  steps:
    - name: "setup"
      prompt: "init"
    - group: "cycle"
      loop:
        count: 3
        delay: "1s"
      steps:
        - name: "develop"
          prompt: "code"
        - name: "review"
          prompt: "review"
    - name: "cleanup"
      prompt: "done"
`
	path := filepath.Join(t.TempDir(), "test.yaml")
	os.WriteFile(path, []byte(yaml), 0644)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.Pipeline.Steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(cfg.Pipeline.Steps))
	}
	if !cfg.Pipeline.Steps[1].IsGroup() {
		t.Error("expected step[1] to be a group")
	}
	if len(cfg.Pipeline.Steps[1].Steps) != 2 {
		t.Errorf("expected 2 nested steps, got %d", len(cfg.Pipeline.Steps[1].Steps))
	}
}

func TestResolvedCommand_Defaults(t *testing.T) {
	defaults := DefaultsConfig{Command: "claude", Args: []string{"--dangerously-skip-permissions", "-p"}}
	step := StepConfig{Name: "test", Prompt: "analyze this code"}

	cmd, args := step.ResolvedCommand(defaults)
	if cmd != "claude" {
		t.Errorf("expected 'claude', got %q", cmd)
	}
	if len(args) != 3 || args[2] != "analyze this code" {
		t.Errorf("expected prompt appended, got %v", args)
	}
}

func TestResolvedCommand_Override(t *testing.T) {
	defaults := DefaultsConfig{Command: "claude", Args: []string{"-p"}}
	step := StepConfig{Name: "test", Command: "echo", Args: []string{"hello"}}

	cmd, args := step.ResolvedCommand(defaults)
	if cmd != "echo" {
		t.Errorf("expected 'echo', got %q", cmd)
	}
	if len(args) != 1 || args[0] != "hello" {
		t.Errorf("expected ['hello'], got %v", args)
	}
}

func TestResolvedEnv_Merge(t *testing.T) {
	defaults := DefaultsConfig{Env: map[string]string{"A": "1", "B": "2"}}
	step := StepConfig{Name: "test", Env: map[string]string{"B": "override", "C": "3"}}

	env := step.ResolvedEnv(defaults)
	if env["A"] != "1" {
		t.Errorf("expected A=1, got %q", env["A"])
	}
	if env["B"] != "override" {
		t.Errorf("expected B=override, got %q", env["B"])
	}
	if env["C"] != "3" {
		t.Errorf("expected C=3, got %q", env["C"])
	}
}

func TestValidate_MissingName(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Steps: []StepConfig{{Name: "a", Command: "echo"}},
	}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for missing name")
	}
}

func TestValidate_NoSteps(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{Name: "test"}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for no steps")
	}
}

func TestValidate_NoCommand(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:  "test",
		Steps: []StepConfig{{Name: "a", Prompt: "hello"}},
	}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for missing command")
	}
}

func TestValidate_CommandFromDefaults(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:     "test",
		Defaults: DefaultsConfig{Command: "echo"},
		Steps:    []StepConfig{{Name: "a", Prompt: "hello"}},
	}}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidate_InvalidOnError(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:  "test",
		Steps: []StepConfig{{Name: "a", Command: "echo", OnError: "explode"}},
	}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for invalid on_error")
	}
}

func TestValidate_EmptyGroup(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:  "test",
		Steps: []StepConfig{{Group: "empty"}},
	}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for empty group")
	}
}

func TestValidate_GroupWithNestedAgent(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:     "test",
		Defaults: DefaultsConfig{Command: "echo"},
		Steps: []StepConfig{
			{
				Group: "g1",
				Steps: []StepConfig{
					{Name: "a", Prompt: "hello"},
				},
			},
		},
	}}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidate_RetryDefaultCount(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name:  "test",
		Steps: []StepConfig{{Name: "a", Command: "echo", OnError: "retry"}},
	}}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Pipeline.Steps[0].RetryCount != 1 {
		t.Errorf("expected retry_count 1, got %d", cfg.Pipeline.Steps[0].RetryCount)
	}
}

func TestValidate_StepLoopDelay(t *testing.T) {
	cfg := &Config{Pipeline: PipelineConfig{
		Name: "test",
		Steps: []StepConfig{{
			Name: "a", Command: "echo",
			Loop: LoopConfig{Count: 3, Delay: "bad"},
		}},
	}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for invalid step loop delay")
	}
}
