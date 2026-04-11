<div align="center">

# agent-orchestra

**Orchestrate AI agents and shell commands with YAML-driven pipelines**

[![CI](https://github.com/pantyukhov/agent-orchestra/actions/workflows/ci.yml/badge.svg)](https://github.com/pantyukhov/agent-orchestra/actions/workflows/ci.yml)
[![Release](https://github.com/pantyukhov/agent-orchestra/actions/workflows/release.yml/badge.svg)](https://github.com/pantyukhov/agent-orchestra/releases)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Quick Start](#quick-start) &bull; [Pipeline Mode](#pipeline-mode) &bull; [Orchestrator Mode](#orchestrator-mode) &bull; [SSH & tmux](#ssh--tmux-remote-execution) &bull; [Desktop GUI](#desktop-gui) &bull; [Configuration](#configuration-reference)

</div>

---

agent-orchestra is a lightweight CLI tool that chains AI agents (Claude Code, etc.) and shell commands into repeatable workflows. Define your steps in YAML — loops, retries, groups, and error handling come built-in.

Three ways to use it:

- **Pipeline** — run steps sequentially from a YAML config
- **Orchestrator** — event-driven loop that polls GitLab, processes events through pipelines, and manages state via issue labels
- **Desktop GUI** — Electron app to visually manage configs, run pipelines, and browse execution history

## Features

- **YAML-driven pipelines** with loops, groups, retries, and error handling
- **Orchestrator mode** with GitLab integration (issues + CI failures)
- **SSH remote execution** — run agents on remote hosts with persistent tmux sessions
- **Desktop GUI** — Electron + React + shadcn/ui app for visual config editing and monitoring
- **Run history** — git-friendly JSON records of every execution with tmux reconnect info
- **Template engine** — inject event data into prompts and actions via `{{ .key }}` syntax
- **Step output capture** — pass stdout between steps
- **State machine** — automatic label transitions (`ai:todo` → `ai:in-progress` → `ai:done`)
- **Built-in actions** — git operations, GitLab comments, issue management
- **Concurrency control** with deduplication and per-task logging

## Quick Start

### Install

**From releases** (recommended):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# Linux (amd64)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# Linux (arm64)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/
```

**From source** (requires Go 1.22+):

```bash
go install github.com/pavelpantiukhov/agent-orchestra/cmd/agent-orchestra@latest
```

Or clone and build:

```bash
git clone https://github.com/pantyukhov/agent-orchestra.git
cd agent-orchestra
make build
make install
```

### Run your first pipeline

Create `pipeline.yaml`:

```yaml
pipeline:
  name: "hello-world"

  defaults:
    command: "claude"
    args: ["--dangerously-skip-permissions", "-p"]
    timeout: "10m"

  steps:
    - name: "analyze"
      prompt: "Analyze the project structure and summarize it"

    - name: "build"
      command: "make"
      args: ["build"]
```

```bash
agent-orchestra -config pipeline.yaml
```

## Pipeline Mode

Run a sequence of steps with loops, groups, retries, and shared defaults.

### Step Options

| Field | Description |
|-------|-------------|
| `name` | Step identifier |
| `command` | Executable (overrides `defaults.command`) |
| `args` | Arguments (overrides `defaults.args`) |
| `prompt` | Appended to args as the last argument |
| `timeout` | Max duration (`5m`, `1h`) |
| `working_dir` | Working directory for this step |
| `env` | Environment variables (merged with `defaults.env`) |
| `on_error` | `stop` (default), `continue`, or `retry` |
| `retry_count` | Number of retries when `on_error: retry` |
| `retry_delay` | Delay between retries |
| `capture_output` | Capture stdout for use by later steps |
| `loop.count` | Repeat this step N times |
| `loop.delay` | Delay between repetitions |

### Multi-line Prompts

```yaml
# Preserves newlines (literal block)
- name: "review"
  prompt: |
    Review the code.
    Focus on:
    - security
    - performance

# Folds into single line
- name: "summarize"
  prompt: >
    Read all Go files and produce
    a one-paragraph summary.
```

### Groups

Group steps into repeatable units with their own loop and error handling:

```yaml
steps:
  - group: "develop-review-cycle"
    loop:
      count: 5
      delay: "10s"
    steps:
      - name: "develop"
        prompt: "Implement the next task with tests"
      - name: "review"
        prompt: "Review changes and fix issues"
```

Groups can be nested. All pipeline features (loops, retries, defaults) work inside groups.

### Output Passing

Capture a step's stdout and use it in subsequent steps:

```yaml
steps:
  - name: "analyze"
    prompt: "List all TODO comments in the codebase"
    capture_output: true

  - name: "fix"
    prompt: |
      Fix these TODOs:
      {{ stepOutput .steps "analyze" }}
```

## Orchestrator Mode

Event-driven loop that polls GitLab for issues and CI failures, runs pipelines with templated variables, and manages state transitions via labels.

```bash
# Continuous polling
GITLAB_TOKEN=glpat-xxx agent-orchestra -config orchestrator.yaml

# Single poll (useful for cron jobs)
GITLAB_TOKEN=glpat-xxx agent-orchestra -config orchestrator.yaml --once
```

### How It Works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Triggers   │────▸│ Priority Queue│────▸│  Orchestrator  │
│ (GitLab API) │     │  (by priority)│     │                │
└─────────────┘     └──────────────┘     │  1. Lock event  │
                                          │  2. on_start    │
                                          │  3. Run pipeline│
                                          │  4. on_success/ │
                                          │     on_failure  │
                                          │  5. Unlock      │
                                          └───────────────┘
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITLAB_TOKEN` | Yes | GitLab API token |
| `GITLAB_URL` | No | GitLab base URL (default: `https://gitlab.com`) |

### Triggers

| Type | Description | Required gitlab fields |
|------|-------------|----------------------|
| `gitlab-issues` | Poll issues by label | `project`, `labels` |
| `gitlab-ci` | Watch MR pipelines for failures | `project`, `username`, `watch_jobs` |

### Template Variables

Templates use Go's `{{ .key }}` syntax. Available variables depend on the trigger type:

<details>
<summary><strong>gitlab-issues</strong></summary>

| Variable | Description |
|----------|-------------|
| `{{ .issue_iid }}` | GitLab issue IID |
| `{{ .issue_title }}` | Issue title |
| `{{ .issue_url }}` | Issue web URL |
| `{{ .jira_id }}` | Jira ID extracted from title (e.g., `AS-123`) |
| `{{ .project }}` | GitLab project path |
| `{{ .labels }}` | Comma-separated labels |

</details>

<details>
<summary><strong>gitlab-ci</strong></summary>

| Variable | Description |
|----------|-------------|
| `{{ .mr_iid }}` | Merge request IID |
| `{{ .mr_title }}` | MR title |
| `{{ .mr_branch }}` | Source branch |
| `{{ .mr_url }}` | MR web URL |
| `{{ .pipeline_id }}` | Failed pipeline ID |
| `{{ .failed_jobs }}` | Comma-separated failed job names |
| `{{ .jira_id }}` | Jira ID from branch/title |
| `{{ .project }}` | GitLab project path |

</details>

### Built-in Actions

| Action | Fields | Description |
|--------|--------|-------------|
| `git-save` | `message` | Stage and commit uncommitted changes |
| `git-checkout` | `branch`, `create_from` | Checkout or create a branch |
| `gitlab-comment` | `issue`, `body` | Add a comment to a GitLab issue |
| `gitlab-close-issue` | `issue` | Close a GitLab issue |

### State Machine

Each pipeline defines label transitions for `on_start`, `on_success`, `on_failure`, and `on_needs_human`:

```yaml
state:
  on_start:
    remove_labels: ["ai:todo"]
    add_labels: ["ai:in-progress"]
  on_success:
    remove_labels: ["ai:in-progress"]
    add_labels: ["ai:done"]
    close_issue: true
  on_failure:
    remove_labels: ["ai:in-progress"]
    add_labels: ["ai:failed"]
  on_needs_human:
    remove_labels: ["ai:in-progress"]
    add_labels: ["ai:needs-review"]
```

**Label lifecycle:**

```
New task:        ai:todo  ──▸  ai:in-progress  ──▸  ai:done
Human answered:  ai:answered  ──▸  ai:in-progress  ──▸  ai:done
CI failure:      (detected)  ──▸  ai:in-progress  ──▸  ai:done
Needs human:     ai:in-progress  ──▸  ai:needs-review
```

## SSH & tmux Remote Execution

Run agents on remote machines via SSH. Commands can run inside persistent tmux sessions — if SSH disconnects, the agent keeps running.

```yaml
pipeline:
  name: "remote-agent"
  defaults:
    command: "claude"
    args: ["--dangerously-skip-permissions", "-p"]
    timeout: "30m"
    ssh:
      host: "build-server.example.com"
      user: "deploy"
      # key_file: "~/.ssh/id_ed25519"  # auto-detected if not set
      tmux:
        session: "my-agent"             # base name; each run gets a unique suffix
        log_dir: "/tmp/agent-orchestra"
        ttl: "72h"                      # auto-kill session after this duration

  steps:
    - name: "task"
      prompt: "Run the analysis task"
```

### SSH Config Fields

| Field | Description |
|-------|-------------|
| `host` | Remote host address |
| `user` | SSH username |
| `port` | SSH port (default: 22) |
| `key_file` | Path to private key (auto-detects `~/.ssh/id_ed25519` and `id_rsa`) |
| `password` | Password auth (prefer keys) |
| `password_env` | Env var containing password |
| `known_hosts` | Path to known_hosts file (empty = skip verification) |
| `tmux.session` | Base session name (each run appends timestamp) |
| `tmux.log_dir` | Remote directory for output logs |
| `tmux.ttl` | Auto-kill session after duration (default: `72h`) |

### Reconnecting to tmux Sessions

Each run creates a unique tmux session (e.g., `my-agent-20260411-120000`):

```bash
# List sessions
ssh deploy@build-server.example.com 'tmux ls'

# Reattach
ssh deploy@build-server.example.com -t 'tmux attach -t my-agent-20260411-120000'
```

SSH config can be set at `defaults` level (all steps remote) or per-step. Steps without SSH config run locally.

See [`example/ssh-tmux.yaml`](example/ssh-tmux.yaml) for a complete example.

## Desktop GUI

An Electron desktop app for visual management of orchestrator configs, execution, and history.

### Install & Run

```bash
cd gui
npm install
npm run dev       # development with hot-reload
npm run build     # production build
```

### Features

- **Workspace mode** — open a project folder (like VS Code) to see all configs, history, and logs
- **Config editor** — visual forms for triggers, pipelines, steps, state transitions, and SSH/tmux settings
- **Execution** — start/stop the orchestrator, live terminal output, state monitoring
- **Run history** — browse all past runs with status, duration, step results, and tmux attach commands
- **Logs** — browse and view per-task log files

### Workspace Structure

```
my-workspace/
  configs/               # YAML config files (orchestrator + pipeline)
    orchestrator.yaml
    hello-world.yaml
  .history/              # Run history (git-friendly JSON, one file per run)
    20260411-120000.json
    20260411-160000.json
  logs/                  # Per-task execution logs
```

History files record everything needed to resume or debug a run:

```json
{
  "id": "20260411-120000",
  "pipeline": "hello-world-remote",
  "status": "success",
  "duration": "5m32s",
  "tmux": {
    "session": "hello-20260411-120000",
    "attach": "ssh dev@192.168.1.100 -t 'tmux attach -t hello-20260411-120000'"
  },
  "steps": [...]
}
```

## Configuration Reference

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config` | `pipeline.yaml` | Path to YAML config file |
| `-version` | | Show version and exit |
| `-once` | | Single poll, no loop (orchestrator mode) |

### Full Orchestrator Example

See [`example/orchestrator.yaml`](example/orchestrator.yaml) for a complete configuration with multiple triggers and pipelines.

```yaml
orchestrator:
  name: "autonomous-ai"
  project_root: "."

  defaults:
    command: "claude"
    args: ["--dangerously-skip-permissions", "-p"]
    timeout: "30m"

  concurrency:
    max: 1

  logging:
    dir: "./logs"
    per_task: true

  persistence:
    file: ".agent-orchestra.state.json"

  triggers:
    - name: "new-tasks"
      type: "gitlab-issues"
      gitlab:
        project: "mygroup/myproject"
        labels: ["ai:todo"]
      poll_interval: "2m"
      priority: 3
      pipeline: "handle-task"

  pipelines:
    handle-task:
      state:
        on_start:
          remove_labels: ["ai:todo"]
          add_labels: ["ai:in-progress"]
        on_success:
          remove_labels: ["ai:in-progress"]
          add_labels: ["ai:done"]
        on_failure:
          remove_labels: ["ai:in-progress"]
          add_labels: ["ai:failed"]
      steps:
        - action: "git-save"
        - action: "git-checkout"
          branch: "feat/{{ .jira_id }}"
          create_from: "origin/master"
        - name: "implement"
          prompt: "Implement task {{ .jira_id }}: {{ .issue_title }}"
        - action: "gitlab-comment"
          issue: "{{ .issue_iid }}"
          body: "AI completed work on {{ .jira_id }}"
```

## Project Structure

```
cmd/agent-orchestra/       CLI entrypoint
internal/
  config/                  YAML config types and validation
  pipeline/                Step execution with loops, groups, retries
  runner/                  Shell command runner + SSH/tmux executor
  orchestrator/            Event loop: poll → prioritize → run → transition
  trigger/                 Trigger interface + GitLab API client
  action/                  Built-in actions (git, gitlab)
  event/                   Event type + priority queue
  state/                   JSON file persistence, locks, dedup
  history/                 Run history (git-friendly JSON records)
  tmpl/                    Go template rendering
gui/                       Electron + React + shadcn/ui desktop app
example/
  orchestrator.yaml        Orchestrator config example
  scheduled.yaml           Scheduled polling example (every 4h)
  ssh-tmux.yaml            SSH + tmux remote execution example
```

## Contributing

```bash
git clone https://github.com/pantyukhov/agent-orchestra.git
cd agent-orchestra
make build    # build binary
make test     # run tests with race detector
make install  # install to $GOPATH/bin
```

## License

MIT
