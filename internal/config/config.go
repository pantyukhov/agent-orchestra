package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Pipeline     *PipelineConfig     `yaml:"pipeline"`
	Orchestrator *OrchestratorConfig `yaml:"orchestrator"`
}

func (c *Config) Mode() string {
	if c.Orchestrator != nil {
		return "orchestrator"
	}
	return "pipeline"
}

type PipelineConfig struct {
	Name     string         `yaml:"name"`
	Defaults DefaultsConfig `yaml:"defaults"`
	Loop     LoopConfig     `yaml:"loop"`
	Steps    []StepConfig   `yaml:"steps"`
}

type DefaultsConfig struct {
	Command    string            `yaml:"command"`
	Args       []string          `yaml:"args"`
	Env        map[string]string `yaml:"env"`
	WorkingDir string            `yaml:"working_dir"`
	Timeout    string            `yaml:"timeout"`
	OnError    string            `yaml:"on_error"`
}

type LoopConfig struct {
	Count int    `yaml:"count"` // 0 = infinite
	Delay string `yaml:"delay"` // Go duration string, e.g. "5s"
}

// StepConfig is either a single agent (Name), a group (Group), or a built-in action (Action).
type StepConfig struct {
	// Agent fields
	Name       string            `yaml:"name"`
	Command    string            `yaml:"command"`
	Args       []string          `yaml:"args"`
	Prompt     string            `yaml:"prompt"`
	Env        map[string]string `yaml:"env"`
	WorkingDir string            `yaml:"working_dir"`
	Timeout    string            `yaml:"timeout"`
	OnError    string            `yaml:"on_error"`
	RetryCount int               `yaml:"retry_count"`
	RetryDelay string            `yaml:"retry_delay"`

	// Group fields
	Group string       `yaml:"group"`
	Steps []StepConfig `yaml:"steps"`

	// Built-in action
	Action     string `yaml:"action"`      // git-save, git-checkout, gitlab-comment, etc.
	Branch     string `yaml:"branch"`      // git-checkout
	CreateFrom string `yaml:"create_from"` // git-checkout
	Message    string `yaml:"message"`     // git-save
	Issue      string `yaml:"issue"`       // gitlab-comment, gitlab-close-issue
	Body       string `yaml:"body"`        // gitlab-comment

	// Common
	Loop LoopConfig `yaml:"loop"`
}

func (s *StepConfig) IsGroup() bool {
	return s.Group != ""
}

func (s *StepConfig) IsAction() bool {
	return s.Action != ""
}

// Label returns display name.
func (s *StepConfig) Label() string {
	if s.Group != "" {
		return s.Group
	}
	if s.Action != "" {
		return s.Action
	}
	return s.Name
}

// ResolvedCommand returns the effective command and args for this agent,
// applying defaults and appending prompt.
func (s *StepConfig) ResolvedCommand(defaults DefaultsConfig) (string, []string) {
	cmd := defaults.Command
	if s.Command != "" {
		cmd = s.Command
	}

	var args []string
	if s.Args != nil {
		args = append([]string{}, s.Args...)
	} else if defaults.Args != nil {
		args = append([]string{}, defaults.Args...)
	}

	if s.Prompt != "" {
		args = append(args, s.Prompt)
	}

	return cmd, args
}

// ResolvedEnv returns merged env vars (defaults + step, step wins).
func (s *StepConfig) ResolvedEnv(defaults DefaultsConfig) map[string]string {
	if len(defaults.Env) == 0 && len(s.Env) == 0 {
		return nil
	}
	merged := make(map[string]string)
	for k, v := range defaults.Env {
		merged[k] = v
	}
	for k, v := range s.Env {
		merged[k] = v
	}
	return merged
}

func (s *StepConfig) ResolvedWorkingDir(defaults DefaultsConfig) string {
	if s.WorkingDir != "" {
		return s.WorkingDir
	}
	return defaults.WorkingDir
}

func (s *StepConfig) ResolvedTimeout(defaults DefaultsConfig) string {
	if s.Timeout != "" {
		return s.Timeout
	}
	return defaults.Timeout
}

func (s *StepConfig) ResolvedOnError(defaults DefaultsConfig) string {
	if s.OnError != "" {
		return s.OnError
	}
	if defaults.OnError != "" {
		return defaults.OnError
	}
	return "stop"
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config %s: %w", path, err)
	}

	switch cfg.Mode() {
	case "orchestrator":
		if err := cfg.Orchestrator.Validate(); err != nil {
			return nil, fmt.Errorf("invalid config: %w", err)
		}
	case "pipeline":
		if cfg.Pipeline == nil {
			return nil, fmt.Errorf("config must have either 'pipeline' or 'orchestrator' section")
		}
		if err := cfg.validatePipeline(); err != nil {
			return nil, fmt.Errorf("invalid config: %w", err)
		}
	}

	return &cfg, nil
}

func (c *Config) validatePipeline() error {
	p := c.Pipeline
	if p.Name == "" {
		return fmt.Errorf("pipeline.name is required")
	}

	if len(p.Steps) == 0 {
		return fmt.Errorf("pipeline.steps must have at least one step")
	}

	if p.Loop.Delay != "" {
		if _, err := time.ParseDuration(p.Loop.Delay); err != nil {
			return fmt.Errorf("pipeline.loop.delay %q: %w", p.Loop.Delay, err)
		}
	}

	if p.Defaults.Timeout != "" {
		if _, err := time.ParseDuration(p.Defaults.Timeout); err != nil {
			return fmt.Errorf("defaults.timeout %q: %w", p.Defaults.Timeout, err)
		}
	}

	if p.Defaults.OnError != "" {
		switch p.Defaults.OnError {
		case "stop", "continue", "retry":
		default:
			return fmt.Errorf("defaults.on_error must be stop, continue, or retry (got %q)", p.Defaults.OnError)
		}
	}

	return c.validateSteps(p.Steps, p.Defaults, "")
}

func (c *Config) validateSteps(steps []StepConfig, defaults DefaultsConfig, prefix string) error {
	for i := range steps {
		s := &steps[i]
		path := fmt.Sprintf("%sstep[%d]", prefix, i)

		if s.IsGroup() {
			if len(s.Steps) == 0 {
				return fmt.Errorf("%s group %q: must have at least one nested step", path, s.Group)
			}
			if s.Loop.Delay != "" {
				if _, err := time.ParseDuration(s.Loop.Delay); err != nil {
					return fmt.Errorf("%s group %q: invalid loop.delay %q: %w", path, s.Group, s.Loop.Delay, err)
				}
			}
			if err := c.validateSteps(s.Steps, defaults, fmt.Sprintf("%s group %q → ", path, s.Group)); err != nil {
				return err
			}
			continue
		}

		if s.IsAction() {
			// Actions don't need command validation
			continue
		}

		// Validate agent
		if s.Name == "" {
			return fmt.Errorf("%s: name, group, or action is required", path)
		}

		cmd, _ := s.ResolvedCommand(defaults)
		if cmd == "" {
			return fmt.Errorf("%s %q: command is required (set defaults.command or step command)", path, s.Name)
		}

		timeout := s.ResolvedTimeout(defaults)
		if timeout != "" {
			if _, err := time.ParseDuration(timeout); err != nil {
				return fmt.Errorf("%s %q: invalid timeout %q: %w", path, s.Name, timeout, err)
			}
		}

		onError := s.ResolvedOnError(defaults)
		switch onError {
		case "stop", "continue", "retry":
		default:
			return fmt.Errorf("%s %q: on_error must be stop, continue, or retry (got %q)", path, s.Name, onError)
		}

		if onError == "retry" && s.RetryCount <= 0 {
			steps[i].RetryCount = 1
		}

		if s.RetryDelay != "" {
			if _, err := time.ParseDuration(s.RetryDelay); err != nil {
				return fmt.Errorf("%s %q: invalid retry_delay %q: %w", path, s.Name, s.RetryDelay, err)
			}
		}

		if s.Loop.Delay != "" {
			if _, err := time.ParseDuration(s.Loop.Delay); err != nil {
				return fmt.Errorf("%s %q: invalid loop.delay %q: %w", path, s.Name, s.Loop.Delay, err)
			}
		}
	}

	return nil
}

func ParseDuration(s string, def time.Duration) time.Duration {
	if s == "" {
		return def
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return def
	}
	return d
}
