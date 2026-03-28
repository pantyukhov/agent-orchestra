# agent-orchestra

A CLI tool for orchestrating AI agents (Claude Code, etc.) and shell commands. Two modes:

- **Pipeline mode** — run steps sequentially from a YAML config with loops, groups, and retries
- **Orchestrator mode** — event-driven loop that polls GitLab for issues/CI failures, runs pipelines with templated variables, manages state via labels

## Installation

### From GitHub Releases (Linux / macOS)

Download the latest binary from [Releases](https://github.com/pantyukhov/agent-orchestra/releases):

```bash
# macOS arm64 (Apple Silicon)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# macOS amd64 (Intel)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# Linux amd64
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# Linux arm64
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/
```

### From source

Requires Go 1.22+.

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

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config` | `pipeline.yaml` | Path to YAML config file |
| `-version` | | Show version and exit |
| `-once` | | Single poll, no loop (orchestrator mode) |

## Pipeline mode

Run a sequence of steps with loops, groups, retries, and a shared default command.

```bash
agent-orchestra -config pipeline.yaml
```

### Minimal example

```yaml
pipeline:
  name: "my-pipeline"

  defaults:
    command: "claude"
    args: ["--dangerously-skip-permissions", "-p"]
    timeout: "10m"

  loop:
    count: 1

  steps:
    - name: "analyze"
      prompt: "Analyze the project structure"

    - name: "build"
      command: "make"
      args: ["build"]
```

### Step options

| Field | Description |
|-------|-------------|
| `name` | Step identifier |
| `command` | Executable (overrides `defaults.command`) |
| `args` | Arguments (overrides `defaults.args`) |
| `prompt` | Appended to args as last argument |
| `timeout` | Max duration (`5m`, `1h`) |
| `working_dir` | Working directory |
| `env` | Environment variables (merged with `defaults.env`) |
| `on_error` | `stop` (default), `continue`, or `retry` |
| `retry_count` | Retries when `on_error: retry` |
| `retry_delay` | Delay between retries |
| `loop.count` | Repeat this step N times |
| `loop.delay` | Delay between repetitions |

### Multi-line prompts

```yaml
# Preserves newlines
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

Group steps into a repeatable unit:

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

Groups can be nested. All pipeline features (loops, groups, retries, defaults) also work inside orchestrator pipelines.

## Orchestrator mode

Event-driven loop that polls GitLab, processes events through pipelines, and manages state via issue labels.

```bash
# Continuous poll loop
GITLAB_TOKEN=glpat-xxx agent-orchestra -config orchestrator.yaml

# Single poll
GITLAB_TOKEN=glpat-xxx agent-orchestra -config orchestrator.yaml --once
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITLAB_TOKEN` | Yes | GitLab API token |
| `GITLAB_URL` | No | GitLab base URL (default: `https://gitlab.com`) |

### Config structure

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
        url: "https://gitlab.example.com"
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
          prompt: "/issues-worder {{ .jira_id }}"
```

### Triggers

| Type | Description | Required gitlab fields |
|------|-------------|----------------------|
| `gitlab-issues` | Polls issues by label | `project`, `labels` |
| `gitlab-ci` | Watches MR pipelines for failures | `project`, `username`, `watch_jobs` |

### Template variables

Templates use `{{ .key }}` syntax. Available variables depend on trigger type:

**gitlab-issues:**
`issue_iid`, `issue_title`, `issue_url`, `jira_id`, `project`, `labels`

**gitlab-ci:**
`mr_iid`, `mr_title`, `mr_branch`, `mr_url`, `pipeline_id`, `failed_jobs`, `jira_id`, `project`

### Built-in actions

| Action | Fields | Description |
|--------|--------|-------------|
| `git-save` | `message` | Stage and commit uncommitted changes |
| `git-checkout` | `branch`, `create_from` | Checkout or create a branch |
| `gitlab-comment` | `issue`, `body` | Add a comment to a GitLab issue |
| `gitlab-close-issue` | `issue` | Close a GitLab issue |

### State machine

Each pipeline defines label transitions for `on_start`, `on_success`, `on_failure`:

```yaml
state:
  on_start:
    remove_labels: ["ai:todo"]
    add_labels: ["ai:in-progress"]
  on_success:
    remove_labels: ["ai:in-progress"]
    add_labels: ["ai:done"]
    close_issue: true
```

### Label lifecycle

```
New task:     ai:todo → ai:in-progress → ai:done (or ai:failed)
Answered:     ai:answered → ai:in-progress → ai:done
CI fix:       (detected) → ai:in-progress → ai:done
```

See [example/orchestrator.yaml](example/orchestrator.yaml) for a full example.

## Project structure

```
cmd/agent-orchestra/     - CLI entrypoint
internal/
  config/                - YAML config types (pipeline + orchestrator)
  pipeline/              - Sequential step execution with loops/groups
  runner/                - Shell command runner (timeout, env, working_dir)
  trigger/               - Trigger interface + GitLab API client
  action/                - Built-in actions (git, gitlab)
  orchestrator/          - Event loop: poll → prioritize → run → transition
  event/                 - Event type + priority queue
  state/                 - JSON file persistence, locks, dedup
  tmpl/                  - Go template rendering
example/
  orchestrator.yaml      - Full orchestrator config example
```

## License

MIT
