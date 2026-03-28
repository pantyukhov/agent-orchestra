# agent-orchestra

A CLI tool for orchestrating sequential and looped pipelines of AI agents (Claude Code, etc.) and shell commands via declarative YAML configs.

## Installation

### From GitHub Releases (Linux / macOS)

Download the latest binary from [Releases](https://github.com/pantyukhov/agent-orchestra/releases):

```bash
# Linux amd64
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# Linux arm64
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_linux_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# macOS arm64 (Apple Silicon)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_arm64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/

# macOS amd64 (Intel)
curl -L https://github.com/pantyukhov/agent-orchestra/releases/latest/download/agent-orchestra_darwin_amd64.tar.gz | tar xz
sudo mv agent-orchestra /usr/local/bin/
```

### From source

Requires Go 1.25+.

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

## Usage

```bash
agent-orchestra -config pipeline.yaml
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config` | `pipeline.yaml` | Path to pipeline config file |
| `-version` | | Show version and exit |
| `-once` | | Run once and exit (orchestrator mode) |

## Configuration

Pipelines are defined in YAML. A basic example:

```yaml
pipeline:
  name: "my-pipeline"

  defaults:
    command: "claude"
    args: ["--dangerously-skip-permissions", "-p"]
    timeout: "10m"
    on_error: "stop"
    working_dir: "/home/user/myproject"

  steps:
    - name: "analyze"
      prompt: "Analyze the project structure and list all source files"

    - name: "refactor"
      prompt: |
        Review the codebase and refactor where needed.
        Focus on removing code duplication.

    - name: "build"
      command: "make"
      args: ["build"]
      timeout: "5m"
```

### Step options

| Field | Description |
|-------|-------------|
| `name` | Step identifier |
| `command` | Executable to run (overrides `defaults.command`) |
| `args` | Arguments list (overrides `defaults.args`) |
| `prompt` | Prompt text appended to args for AI agents |
| `timeout` | Max duration (`5m`, `1h`, etc.) |
| `working_dir` | Working directory for the step |
| `env` | Environment variables (merged with `defaults.env`) |
| `on_error` | `stop`, `continue`, or `retry` |
| `retry_count` | Number of retries when `on_error: retry` |
| `retry_delay` | Delay between retries |

### Loops

Steps and groups can be looped:

```yaml
steps:
  - name: "lint-fix"
    prompt: "Run linters and fix issues"
    loop:
      count: 3
      delay: "5s"
```

### Groups

Group steps into repeatable units:

```yaml
steps:
  - group: "develop-review-cycle"
    loop:
      count: 5
    steps:
      - name: "develop"
        prompt: "Implement the next task with tests"
      - name: "code-review"
        prompt: "Review changes and fix issues"
```

See [example/example.yaml](example/example.yaml) for a full configuration showcase.

## License

MIT
