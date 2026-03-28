package tmpl

import (
	"bytes"
	"text/template"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

// RenderStep renders all template strings in a StepConfig using event data.
func RenderStep(step config.StepConfig, data map[string]string) (config.StepConfig, error) {
	var err error

	step.Prompt, err = renderString(step.Prompt, data)
	if err != nil {
		return step, err
	}
	step.Branch, err = renderString(step.Branch, data)
	if err != nil {
		return step, err
	}
	step.CreateFrom, err = renderString(step.CreateFrom, data)
	if err != nil {
		return step, err
	}
	step.Message, err = renderString(step.Message, data)
	if err != nil {
		return step, err
	}
	step.Issue, err = renderString(step.Issue, data)
	if err != nil {
		return step, err
	}
	step.Body, err = renderString(step.Body, data)
	if err != nil {
		return step, err
	}

	for i, arg := range step.Args {
		step.Args[i], err = renderString(arg, data)
		if err != nil {
			return step, err
		}
	}

	// Render nested steps (groups)
	for i, nested := range step.Steps {
		step.Steps[i], err = RenderStep(nested, data)
		if err != nil {
			return step, err
		}
	}

	return step, nil
}

// RenderSteps renders all steps in a list.
func RenderSteps(steps []config.StepConfig, data map[string]string) ([]config.StepConfig, error) {
	result := make([]config.StepConfig, len(steps))
	for i, s := range steps {
		rendered, err := RenderStep(s, data)
		if err != nil {
			return nil, err
		}
		result[i] = rendered
	}
	return result, nil
}

func renderString(s string, data map[string]string) (string, error) {
	if s == "" {
		return "", nil
	}

	// Fast path: no templates
	if !containsTemplate(s) {
		return s, nil
	}

	tmpl, err := template.New("").Option("missingkey=zero").Parse(s)
	if err != nil {
		return s, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return s, err
	}
	return buf.String(), nil
}

func containsTemplate(s string) bool {
	for i := 0; i < len(s)-1; i++ {
		if s[i] == '{' && s[i+1] == '{' {
			return true
		}
	}
	return false
}
