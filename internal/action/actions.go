package action

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/trigger"
)

// Runner executes built-in actions (git, gitlab, etc.).
type Runner struct {
	ProjectRoot string
	GitLab      *trigger.GitLabClient
	Project     string // default gitlab project
	Logger      *slog.Logger
}

func NewRunner(projectRoot, gitlabProject string, gitlab *trigger.GitLabClient, logger *slog.Logger) *Runner {
	return &Runner{
		ProjectRoot: projectRoot,
		GitLab:      gitlab,
		Project:     gitlabProject,
		Logger:      logger,
	}
}

// Execute runs a built-in action step.
func (r *Runner) Execute(ctx context.Context, step config.StepConfig) error {
	switch step.Action {
	case "git-save":
		return r.gitSave(ctx, step)
	case "git-checkout":
		return r.gitCheckout(ctx, step)
	case "gitlab-transition":
		return r.gitlabTransition(ctx, step)
	case "gitlab-comment":
		return r.gitlabComment(ctx, step)
	case "gitlab-close-issue":
		return r.gitlabCloseIssue(ctx, step)
	default:
		return fmt.Errorf("unknown action: %q", step.Action)
	}
}

// ── Git actions ────────────────────────────────────────────────────────────

func (r *Runner) gitSave(ctx context.Context, step config.StepConfig) error {
	r.Logger.Info("git-save: saving uncommitted changes")

	// Check if there are changes
	cmd := exec.CommandContext(ctx, "git", "diff", "--quiet")
	cmd.Dir = r.ProjectRoot
	if cmd.Run() == nil {
		// Also check staged
		cmd2 := exec.CommandContext(ctx, "git", "diff", "--cached", "--quiet")
		cmd2.Dir = r.ProjectRoot
		if cmd2.Run() == nil {
			// Check untracked
			cmd3 := exec.CommandContext(ctx, "git", "ls-files", "--others", "--exclude-standard")
			cmd3.Dir = r.ProjectRoot
			out, _ := cmd3.Output()
			if len(strings.TrimSpace(string(out))) == 0 {
				r.Logger.Info("git-save: no changes to save")
				return nil
			}
		}
	}

	message := step.Message
	if message == "" {
		message = "wip: auto-save before task switch"
	}

	// Stage all and commit
	addCmd := exec.CommandContext(ctx, "git", "add", "-A")
	addCmd.Dir = r.ProjectRoot
	if err := addCmd.Run(); err != nil {
		return fmt.Errorf("git add: %w", err)
	}

	commitCmd := exec.CommandContext(ctx, "git", "commit", "-m", message)
	commitCmd.Dir = r.ProjectRoot
	commitCmd.Stdout = os.Stdout
	commitCmd.Stderr = os.Stderr
	if err := commitCmd.Run(); err != nil {
		return fmt.Errorf("git commit: %w", err)
	}

	r.Logger.Info("git-save: changes saved")
	return nil
}

func (r *Runner) gitCheckout(ctx context.Context, step config.StepConfig) error {
	branch := step.Branch
	if branch == "" {
		return fmt.Errorf("git-checkout: branch is required")
	}

	r.Logger.Info("git-checkout", "branch", branch)

	// Fetch
	fetchCmd := exec.CommandContext(ctx, "git", "fetch", "origin")
	fetchCmd.Dir = r.ProjectRoot
	fetchCmd.Run() // ignore errors

	// Try checkout existing branch
	checkoutCmd := exec.CommandContext(ctx, "git", "checkout", branch)
	checkoutCmd.Dir = r.ProjectRoot
	if err := checkoutCmd.Run(); err != nil {
		// Try remote branch
		checkoutRemote := exec.CommandContext(ctx, "git", "checkout", "-b", branch, "origin/"+branch)
		checkoutRemote.Dir = r.ProjectRoot
		if err := checkoutRemote.Run(); err != nil {
			// Create new branch from base
			createFrom := step.CreateFrom
			if createFrom == "" {
				createFrom = "origin/master"
			}

			createCmd := exec.CommandContext(ctx, "git", "checkout", "-b", branch, createFrom)
			createCmd.Dir = r.ProjectRoot
			if err := createCmd.Run(); err != nil {
				// Try main instead of master
				createFrom = strings.Replace(createFrom, "master", "main", 1)
				createCmd2 := exec.CommandContext(ctx, "git", "checkout", "-b", branch, createFrom)
				createCmd2.Dir = r.ProjectRoot
				if err := createCmd2.Run(); err != nil {
					return fmt.Errorf("git-checkout: could not create branch %s: %w", branch, err)
				}
			}
		}
	}

	// Pull if tracking
	pullCmd := exec.CommandContext(ctx, "git", "pull", "--rebase", "origin", branch)
	pullCmd.Dir = r.ProjectRoot
	pullCmd.Run() // ignore errors

	r.Logger.Info("git-checkout: done", "branch", branch)
	return nil
}

// ── GitLab actions ─────────────────────────────────────────────────────────

func (r *Runner) gitlabTransition(ctx context.Context, step config.StepConfig) error {
	if r.GitLab == nil {
		return fmt.Errorf("gitlab-transition: gitlab client not configured")
	}
	// This is used internally by the orchestrator state machine, not directly in YAML
	return nil
}

func (r *Runner) gitlabComment(ctx context.Context, step config.StepConfig) error {
	if r.GitLab == nil {
		return fmt.Errorf("gitlab-comment: gitlab client not configured")
	}

	issue := step.Issue
	body := step.Body
	if issue == "" {
		return fmt.Errorf("gitlab-comment: issue is required")
	}
	if body == "" {
		return fmt.Errorf("gitlab-comment: body is required")
	}

	project := r.Project
	r.Logger.Info("gitlab-comment", "project", project, "issue", issue)
	return r.GitLab.CommentOnIssue(ctx, project, issue, body)
}

func (r *Runner) gitlabCloseIssue(ctx context.Context, step config.StepConfig) error {
	if r.GitLab == nil {
		return fmt.Errorf("gitlab-close-issue: gitlab client not configured")
	}

	issue := step.Issue
	if issue == "" {
		return fmt.Errorf("gitlab-close-issue: issue is required")
	}

	project := r.Project
	r.Logger.Info("gitlab-close-issue", "project", project, "issue", issue)
	return r.GitLab.CloseIssue(ctx, project, issue)
}
