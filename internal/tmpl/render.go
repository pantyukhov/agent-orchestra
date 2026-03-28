package tmpl

import (
	"bytes"
	"text/template"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

// templateFuncs provides helper functions for templates.
var templateFuncs = template.FuncMap{
	// stepOutput safely retrieves a step's output: {{ stepOutput .steps "review" }}
	"stepOutput": func(steps interface{}, name string) string {
		if steps == nil {
			return ""
		}
		m, ok := steps.(map[string]interface{})
		if !ok {
			return ""
		}
		stepData, ok := m[name].(map[string]interface{})
		if !ok {
			return ""
		}
		output, _ := stepData["output"].(string)
		return output
	},
}

// RenderStep renders all template strings in a StepConfig using data.
// Data can contain nested structures (e.g., map[string]interface{} for step outputs).
func RenderStep(step config.StepConfig, data map[string]interface{}) (config.StepConfig, error) {
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
func RenderSteps(steps []config.StepConfig, data map[string]interface{}) ([]config.StepConfig, error) {
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

// StringData converts a map[string]string to map[string]interface{} for use with render functions.
func StringData(data map[string]string) map[string]interface{} {
	result := make(map[string]interface{}, len(data))
	for k, v := range data {
		result[k] = v
	}
	return result
}

// EnsureStepEntries pre-populates the "steps" map in data with empty entries
// for all named steps in the given step list (recursively). This prevents
// nil pointer dereference when templates reference step outputs before they run.
func EnsureStepEntries(data map[string]interface{}, steps []config.StepConfig) {
	stepsMap := getOrCreateStepsMap(data)

	for _, s := range steps {
		if s.IsGroup() {
			EnsureStepEntries(data, s.Steps)
			continue
		}
		if s.Name != "" {
			if _, exists := stepsMap[s.Name]; !exists {
				stepsMap[s.Name] = map[string]interface{}{
					"output":    "",
					"exit_code": "",
				}
			}
		}
	}
}

func getOrCreateStepsMap(data map[string]interface{}) map[string]interface{} {
	if existing, ok := data["steps"].(map[string]interface{}); ok {
		return existing
	}
	stepsMap := make(map[string]interface{})
	data["steps"] = stepsMap
	return stepsMap
}

func renderString(s string, data map[string]interface{}) (string, error) {
	if s == "" {
		return "", nil
	}

	// Fast path: no templates
	if !containsTemplate(s) {
		return s, nil
	}

	tmpl, err := template.New("").
		Option("missingkey=zero").
		Funcs(templateFuncs).
		Parse(s)
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
