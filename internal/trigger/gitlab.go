package trigger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/event"
	"github.com/pavelpantiukhov/agent-orchestra/internal/state"
)

var jiraIDRegex = regexp.MustCompile(`[A-Z]+-\d+`)

// GitLabClient handles GitLab API requests.
type GitLabClient struct {
	BaseURL string
	Token   string
	Client  *http.Client
	Logger  *slog.Logger
}

func NewGitLabClient(baseURL, token string, logger *slog.Logger) *GitLabClient {
	if baseURL == "" {
		baseURL = os.Getenv("GITLAB_URL")
	}
	if baseURL == "" {
		baseURL = "https://gitlab.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	if token == "" {
		token = os.Getenv("GITLAB_TOKEN")
	}

	return &GitLabClient{
		BaseURL: baseURL,
		Token:   token,
		Client:  &http.Client{Timeout: 30 * time.Second},
		Logger:  logger,
	}
}

func (c *GitLabClient) apiGet(ctx context.Context, path string) ([]byte, error) {
	reqURL := c.BaseURL + "/api/v4" + path
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", c.Token)

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gitlab API %s: %d %s", path, resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	return body, nil
}

func (c *GitLabClient) apiPut(ctx context.Context, path string, params map[string]string) error {
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}

	reqURL := c.BaseURL + "/api/v4" + path
	req, err := http.NewRequestWithContext(ctx, "PUT", reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("PRIVATE-TOKEN", c.Token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("gitlab API PUT %s: %d %s", path, resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	return nil
}

func (c *GitLabClient) apiPost(ctx context.Context, path string, params map[string]string) error {
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}

	reqURL := c.BaseURL + "/api/v4" + path
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("PRIVATE-TOKEN", c.Token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("gitlab API POST %s: %d %s", path, resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	return nil
}

func encodeProject(project string) string {
	return url.PathEscape(project)
}

// TransitionLabels removes/adds labels on a GitLab issue.
func (c *GitLabClient) TransitionLabels(ctx context.Context, project string, iid string, remove, add []string) error {
	encoded := encodeProject(project)

	// Get current labels
	data, err := c.apiGet(ctx, fmt.Sprintf("/projects/%s/issues/%s", encoded, iid))
	if err != nil {
		return fmt.Errorf("get issue labels: %w", err)
	}

	var issue struct {
		Labels []string `json:"labels"`
	}
	if err := json.Unmarshal(data, &issue); err != nil {
		return err
	}

	// Build new label set
	removeSet := make(map[string]bool)
	for _, l := range remove {
		removeSet[l] = true
	}

	var newLabels []string
	for _, l := range issue.Labels {
		if !removeSet[l] {
			newLabels = append(newLabels, l)
		}
	}
	for _, l := range add {
		newLabels = append(newLabels, l)
	}

	return c.apiPut(ctx, fmt.Sprintf("/projects/%s/issues/%s", encoded, iid), map[string]string{
		"labels": strings.Join(newLabels, ","),
	})
}

// CommentOnIssue adds a note to a GitLab issue.
func (c *GitLabClient) CommentOnIssue(ctx context.Context, project, iid, body string) error {
	encoded := encodeProject(project)
	return c.apiPost(ctx, fmt.Sprintf("/projects/%s/issues/%s/notes", encoded, iid), map[string]string{
		"body": body,
	})
}

// CloseIssue closes a GitLab issue.
func (c *GitLabClient) CloseIssue(ctx context.Context, project, iid string) error {
	encoded := encodeProject(project)
	return c.apiPut(ctx, fmt.Sprintf("/projects/%s/issues/%s", encoded, iid), map[string]string{
		"state_event": "close",
	})
}

// GetIssueLabels fetches the current labels on a GitLab issue.
func (c *GitLabClient) GetIssueLabels(ctx context.Context, project, iid string) ([]string, error) {
	encoded := encodeProject(project)
	data, err := c.apiGet(ctx, fmt.Sprintf("/projects/%s/issues/%s", encoded, iid))
	if err != nil {
		return nil, fmt.Errorf("get issue labels: %w", err)
	}
	var issue struct {
		Labels []string `json:"labels"`
	}
	if err := json.Unmarshal(data, &issue); err != nil {
		return nil, fmt.Errorf("parse issue labels: %w", err)
	}
	return issue.Labels, nil
}

// ── GitLab Issues Trigger ──────────────────────────────────────────────────

type GitLabIssuesTrigger struct {
	name     string
	cfg      config.TriggerConfig
	client   *GitLabClient
	state    *state.State
	logger   *slog.Logger
}

func NewGitLabIssuesTrigger(cfg config.TriggerConfig, client *GitLabClient, state *state.State, logger *slog.Logger) *GitLabIssuesTrigger {
	return &GitLabIssuesTrigger{
		name:   cfg.Name,
		cfg:    cfg,
		client: client,
		state:  state,
		logger: logger,
	}
}

func (t *GitLabIssuesTrigger) Name() string { return t.name }

func (t *GitLabIssuesTrigger) Poll(ctx context.Context) ([]event.Event, error) {
	encoded := encodeProject(t.cfg.GitLab.Project)
	labels := strings.Join(t.cfg.GitLab.Labels, ",")

	path := fmt.Sprintf("/projects/%s/issues?labels=%s&state=opened&per_page=20",
		encoded, url.QueryEscape(labels))

	data, err := t.client.apiGet(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("poll %s: %w", t.name, err)
	}

	var issues []struct {
		IID    int      `json:"iid"`
		Title  string   `json:"title"`
		WebURL string   `json:"web_url"`
		Labels []string `json:"labels"`
	}
	if err := json.Unmarshal(data, &issues); err != nil {
		return nil, fmt.Errorf("parse issues: %w", err)
	}

	var events []event.Event
	for _, issue := range issues {
		eventID := fmt.Sprintf("gitlab-issue-%d", issue.IID)

		if t.state.IsLocked(eventID) {
			continue
		}

		jiraID := extractJiraID(issue.Title)

		events = append(events, event.Event{
			ID:       eventID,
			Type:     "gitlab-issue",
			Trigger:  t.name,
			Pipeline: t.cfg.Pipeline,
			Priority: t.cfg.Priority,
			Data: map[string]string{
				"issue_iid":   fmt.Sprintf("%d", issue.IID),
				"issue_title": issue.Title,
				"issue_url":   issue.WebURL,
				"jira_id":     jiraID,
				"project":     t.cfg.GitLab.Project,
				"labels":      strings.Join(issue.Labels, ","),
			},
			Timestamp: time.Now(),
		})
	}

	if len(events) > 0 {
		t.logger.Info("found events", "trigger", t.name, "count", len(events))
	}

	return events, nil
}

// ── GitLab CI Trigger ──────────────────────────────────────────────────────

type GitLabCITrigger struct {
	name   string
	cfg    config.TriggerConfig
	client *GitLabClient
	state  *state.State
	logger *slog.Logger
}

func NewGitLabCITrigger(cfg config.TriggerConfig, client *GitLabClient, state *state.State, logger *slog.Logger) *GitLabCITrigger {
	return &GitLabCITrigger{
		name:   cfg.Name,
		cfg:    cfg,
		client: client,
		state:  state,
		logger: logger,
	}
}

func (t *GitLabCITrigger) Name() string { return t.name }

func (t *GitLabCITrigger) Poll(ctx context.Context) ([]event.Event, error) {
	encoded := encodeProject(t.cfg.GitLab.Project)

	// Get open MRs by user
	path := fmt.Sprintf("/projects/%s/merge_requests?author_username=%s&state=opened&per_page=20",
		encoded, url.QueryEscape(t.cfg.GitLab.Username))

	data, err := t.client.apiGet(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("poll MRs: %w", err)
	}

	var mrs []struct {
		IID          int    `json:"iid"`
		Title        string `json:"title"`
		SourceBranch string `json:"source_branch"`
		WebURL       string `json:"web_url"`
	}
	if err := json.Unmarshal(data, &mrs); err != nil {
		return nil, err
	}

	var events []event.Event

	for _, mr := range mrs {
		// Get latest pipeline
		pipePath := fmt.Sprintf("/projects/%s/merge_requests/%d/pipelines?per_page=1", encoded, mr.IID)
		pipeData, err := t.client.apiGet(ctx, pipePath)
		if err != nil {
			continue
		}

		var pipelines []struct {
			ID     int    `json:"id"`
			Status string `json:"status"`
		}
		if err := json.Unmarshal(pipeData, &pipelines); err != nil || len(pipelines) == 0 {
			continue
		}

		pipeline := pipelines[0]
		if pipeline.Status != "failed" {
			continue
		}

		pipelineID := fmt.Sprintf("%d", pipeline.ID)
		if t.state.IsCISeen(pipelineID) {
			continue
		}

		// Get failed jobs
		jobsPath := fmt.Sprintf("/projects/%s/pipelines/%d/jobs?per_page=50", encoded, pipeline.ID)
		jobsData, err := t.client.apiGet(ctx, jobsPath)
		if err != nil {
			continue
		}

		var jobs []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		}
		if err := json.Unmarshal(jobsData, &jobs); err != nil {
			continue
		}

		var failedJobs []string
		for _, job := range jobs {
			if job.Status == "failed" && matchesAny(job.Name, t.cfg.GitLab.WatchJobs) {
				failedJobs = append(failedJobs, job.Name)
			}
		}

		// Mark as seen regardless
		t.state.MarkCISeen(pipelineID)

		if len(failedJobs) == 0 {
			continue
		}

		jiraID := extractJiraID(mr.SourceBranch)
		if jiraID == "" {
			jiraID = extractJiraID(mr.Title)
		}

		eventID := fmt.Sprintf("gitlab-ci-%d", pipeline.ID)

		events = append(events, event.Event{
			ID:       eventID,
			Type:     "gitlab-ci",
			Trigger:  t.name,
			Pipeline: t.cfg.Pipeline,
			Priority: t.cfg.Priority,
			Data: map[string]string{
				"mr_iid":      fmt.Sprintf("%d", mr.IID),
				"mr_title":    mr.Title,
				"mr_branch":   mr.SourceBranch,
				"mr_url":      mr.WebURL,
				"pipeline_id": pipelineID,
				"failed_jobs": strings.Join(failedJobs, ","),
				"jira_id":     jiraID,
				"project":     t.cfg.GitLab.Project,
			},
			Timestamp: time.Now(),
		})
	}

	if len(events) > 0 {
		t.logger.Info("found CI failures", "trigger", t.name, "count", len(events))
	}

	return events, nil
}

// ── Helpers ────────────────────────────────────────────────────────────────

func extractJiraID(s string) string {
	match := jiraIDRegex.FindString(s)
	return match
}

func matchesAny(name string, patterns []string) bool {
	if len(patterns) == 0 {
		return true // no filter = match all
	}
	for _, p := range patterns {
		if strings.HasSuffix(p, "*") {
			if strings.HasPrefix(name, strings.TrimSuffix(p, "*")) {
				return true
			}
		} else if name == p {
			return true
		}
	}
	return false
}
