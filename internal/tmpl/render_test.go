package tmpl

import (
	"testing"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

func TestRenderStep_FlatData(t *testing.T) {
	step := config.StepConfig{
		Name:   "test",
		Prompt: "Hello {{ .name }}",
	}

	data := map[string]interface{}{
		"name": "world",
	}

	rendered, err := RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", rendered.Prompt)
	}
}

func TestRenderStep_NestedData(t *testing.T) {
	step := config.StepConfig{
		Name:   "implement",
		Prompt: "Fix: {{ .steps.review.output }}",
	}

	data := map[string]interface{}{
		"steps": map[string]interface{}{
			"review": map[string]interface{}{
				"output": "Found 3 bugs",
			},
		},
	}

	rendered, err := RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "Fix: Found 3 bugs" {
		t.Errorf("expected 'Fix: Found 3 bugs', got %q", rendered.Prompt)
	}
}

func TestRenderStep_MissingNestedData_WithEnsure(t *testing.T) {
	step := config.StepConfig{
		Name:   "implement",
		Prompt: "{{ if .steps.review.output }}Feedback: {{ .steps.review.output }}{{ else }}No feedback yet{{ end }}",
	}

	// Pre-populate with EnsureStepEntries so templates work safely
	data := map[string]interface{}{
		"jira_id": "AS-123",
	}

	// Simulate what pipeline does: ensure step entries exist
	steps := []config.StepConfig{
		{Name: "review"},
		{Name: "implement"},
	}
	EnsureStepEntries(data, steps)

	rendered, err := RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "No feedback yet" {
		t.Errorf("expected 'No feedback yet', got %q", rendered.Prompt)
	}
}

func TestRenderStep_StepOutputFunction(t *testing.T) {
	step := config.StepConfig{
		Name:   "implement",
		Prompt: `{{ $out := stepOutput .steps "review" }}{{ if $out }}Fix: {{ $out }}{{ else }}No feedback{{ end }}`,
	}

	// No steps data — stepOutput handles nil safely
	data := map[string]interface{}{}

	rendered, err := RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "No feedback" {
		t.Errorf("expected 'No feedback', got %q", rendered.Prompt)
	}

	// Now with actual output
	data["steps"] = map[string]interface{}{
		"review": map[string]interface{}{
			"output": "3 bugs found",
		},
	}
	rendered, err = RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "Fix: 3 bugs found" {
		t.Errorf("expected 'Fix: 3 bugs found', got %q", rendered.Prompt)
	}
}

func TestEnsureStepEntries(t *testing.T) {
	data := map[string]interface{}{}
	steps := []config.StepConfig{
		{Name: "step1"},
		{
			Group: "group1",
			Steps: []config.StepConfig{
				{Name: "nested1"},
				{Name: "nested2"},
			},
		},
		{Action: "git-save"}, // actions should be skipped
	}

	EnsureStepEntries(data, steps)

	stepsMap := data["steps"].(map[string]interface{})

	for _, name := range []string{"step1", "nested1", "nested2"} {
		entry, ok := stepsMap[name].(map[string]interface{})
		if !ok {
			t.Errorf("expected entry for %q", name)
			continue
		}
		if entry["output"] != "" {
			t.Errorf("expected empty output for %q", name)
		}
	}

	// Should not have action entry
	if _, ok := stepsMap["git-save"]; ok {
		t.Error("should not have entry for action step")
	}
}

func TestEnsureStepEntries_PreservesExisting(t *testing.T) {
	data := map[string]interface{}{
		"steps": map[string]interface{}{
			"review": map[string]interface{}{
				"output":    "existing output",
				"exit_code": "0",
			},
		},
	}

	steps := []config.StepConfig{
		{Name: "review"},
		{Name: "implement"},
	}

	EnsureStepEntries(data, steps)

	stepsMap := data["steps"].(map[string]interface{})
	reviewData := stepsMap["review"].(map[string]interface{})
	if reviewData["output"] != "existing output" {
		t.Error("EnsureStepEntries should not overwrite existing entries")
	}

	// implement should have been added
	implData := stepsMap["implement"].(map[string]interface{})
	if implData["output"] != "" {
		t.Error("expected empty output for new entry")
	}
}

func TestRenderStep_NilData(t *testing.T) {
	step := config.StepConfig{
		Name:   "test",
		Prompt: "no templates here",
	}

	rendered, err := RenderStep(step, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered.Prompt != "no templates here" {
		t.Errorf("expected unchanged prompt, got %q", rendered.Prompt)
	}
}

func TestRenderSteps_Multiple(t *testing.T) {
	steps := []config.StepConfig{
		{Name: "s1", Prompt: "{{ .greeting }}"},
		{Name: "s2", Prompt: "static"},
	}

	data := map[string]interface{}{"greeting": "hi"}

	rendered, err := RenderSteps(steps, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rendered[0].Prompt != "hi" {
		t.Errorf("expected 'hi', got %q", rendered[0].Prompt)
	}
	if rendered[1].Prompt != "static" {
		t.Errorf("expected 'static', got %q", rendered[1].Prompt)
	}
}

func TestStringData(t *testing.T) {
	input := map[string]string{
		"a": "1",
		"b": "2",
	}

	result := StringData(input)
	if result["a"] != "1" || result["b"] != "2" {
		t.Errorf("unexpected result: %v", result)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 entries, got %d", len(result))
	}
}

func TestRenderStep_AllFields(t *testing.T) {
	step := config.StepConfig{
		Name:       "test",
		Prompt:     "{{ .x }}",
		Branch:     "{{ .x }}",
		CreateFrom: "{{ .x }}",
		Message:    "{{ .x }}",
		Issue:      "{{ .x }}",
		Body:       "{{ .x }}",
		Args:       []string{"{{ .x }}", "static"},
	}

	data := map[string]interface{}{"x": "val"}

	rendered, err := RenderStep(step, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, field := range []string{rendered.Prompt, rendered.Branch, rendered.CreateFrom, rendered.Message, rendered.Issue, rendered.Body} {
		if field != "val" {
			t.Errorf("expected 'val', got %q", field)
		}
	}
	if rendered.Args[0] != "val" {
		t.Errorf("expected args[0]='val', got %q", rendered.Args[0])
	}
	if rendered.Args[1] != "static" {
		t.Errorf("expected args[1]='static', got %q", rendered.Args[1])
	}
}
