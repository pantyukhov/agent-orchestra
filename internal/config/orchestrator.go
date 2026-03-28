package config

import (
	"fmt"
	"time"
)

type OrchestratorConfig struct {
	Name        string                `yaml:"name"`
	ProjectRoot string                `yaml:"project_root"`
	Defaults    DefaultsConfig        `yaml:"defaults"`
	Concurrency ConcurrencyConfig     `yaml:"concurrency"`
	Logging     LoggingConfig         `yaml:"logging"`
	Persistence PersistenceConfig     `yaml:"persistence"`
	Triggers    []TriggerConfig       `yaml:"triggers"`
	Pipelines   map[string]PipelineDef `yaml:"pipelines"`
}

type ConcurrencyConfig struct {
	Max int `yaml:"max"` // 0 or 1 = sequential
}

type LoggingConfig struct {
	Dir     string `yaml:"dir"`
	PerTask bool   `yaml:"per_task"`
}

type PersistenceConfig struct {
	File string `yaml:"file"`
}

type TriggerConfig struct {
	Name         string       `yaml:"name"`
	Type         string       `yaml:"type"` // "gitlab-issues", "gitlab-ci"
	GitLab       GitLabConfig `yaml:"gitlab"`
	PollInterval string       `yaml:"poll_interval"`
	Priority     int          `yaml:"priority"`
	Pipeline     string       `yaml:"pipeline"`
}

type GitLabConfig struct {
	Project   string   `yaml:"project"`
	URL       string   `yaml:"url"` // optional, defaults to GITLAB_URL env or https://gitlab.com
	Labels    []string `yaml:"labels"`
	Username  string   `yaml:"username"`
	WatchJobs []string `yaml:"watch_jobs"`
}

type PipelineDef struct {
	State StateConfig  `yaml:"state"`
	Steps []StepConfig `yaml:"steps"`
}

type StateConfig struct {
	OnStart   StateTransition `yaml:"on_start"`
	OnSuccess StateTransition `yaml:"on_success"`
	OnFailure StateTransition `yaml:"on_failure"`
}

type StateTransition struct {
	RemoveLabels []string `yaml:"remove_labels"`
	AddLabels    []string `yaml:"add_labels"`
	CloseIssue   bool     `yaml:"close_issue"`
}

func (o *OrchestratorConfig) Validate() error {
	if o.Name == "" {
		return fmt.Errorf("orchestrator.name is required")
	}

	if len(o.Triggers) == 0 {
		return fmt.Errorf("orchestrator.triggers must have at least one trigger")
	}

	if len(o.Pipelines) == 0 {
		return fmt.Errorf("orchestrator.pipelines must have at least one pipeline")
	}

	for i, t := range o.Triggers {
		if t.Name == "" {
			return fmt.Errorf("trigger[%d]: name is required", i)
		}
		switch t.Type {
		case "gitlab-issues", "gitlab-ci":
		default:
			return fmt.Errorf("trigger %q: type must be gitlab-issues or gitlab-ci (got %q)", t.Name, t.Type)
		}
		if t.GitLab.Project == "" {
			return fmt.Errorf("trigger %q: gitlab.project is required", t.Name)
		}
		if t.Pipeline == "" {
			return fmt.Errorf("trigger %q: pipeline is required", t.Name)
		}
		if _, ok := o.Pipelines[t.Pipeline]; !ok {
			return fmt.Errorf("trigger %q: pipeline %q not found in pipelines", t.Name, t.Pipeline)
		}
		if t.PollInterval != "" {
			if _, err := time.ParseDuration(t.PollInterval); err != nil {
				return fmt.Errorf("trigger %q: invalid poll_interval %q: %w", t.Name, t.PollInterval, err)
			}
		}
		if t.Type == "gitlab-issues" && len(t.GitLab.Labels) == 0 {
			return fmt.Errorf("trigger %q: gitlab.labels is required for gitlab-issues type", t.Name)
		}
		if t.Type == "gitlab-ci" && t.GitLab.Username == "" {
			return fmt.Errorf("trigger %q: gitlab.username is required for gitlab-ci type", t.Name)
		}
	}

	for name, p := range o.Pipelines {
		if len(p.Steps) == 0 {
			return fmt.Errorf("pipeline %q: must have at least one step", name)
		}
	}

	if o.Concurrency.Max <= 0 {
		o.Concurrency.Max = 1
	}

	if o.Persistence.File == "" {
		o.Persistence.File = ".agent-orchestra.state.json"
	}

	return nil
}
