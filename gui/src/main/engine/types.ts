// ── Config types (same YAML format as Go) ────────────────────────

export interface Config {
  pipeline?: PipelineConfig
  orchestrator?: OrchestratorConfig
}

export interface PipelineConfig {
  name: string
  defaults?: DefaultsConfig
  loop?: LoopConfig
  steps: StepConfig[]
}

export interface DefaultsConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  working_dir?: string
  timeout?: string
  on_error?: string
  ssh?: SSHConfig
  session?: boolean
}

export interface SSHConfig {
  host: string
  user: string
  port?: number
  key_file?: string
  password?: string
  password_env?: string
  known_hosts?: string
  tmux?: TmuxConfig
}

export interface TmuxConfig {
  session?: string
  log_dir?: string
  ttl?: string
}

export interface LoopConfig {
  count?: number
  delay?: string
}

export interface StepConfig {
  name?: string
  command?: string
  args?: string[]
  prompt?: string
  env?: Record<string, string>
  working_dir?: string
  timeout?: string
  on_error?: string
  retry_count?: number
  retry_delay?: string
  group?: string
  steps?: StepConfig[]
  action?: string
  branch?: string
  create_from?: string
  message?: string
  issue?: string
  body?: string
  ssh?: SSHConfig
  capture_output?: boolean
  loop?: LoopConfig
  session?: boolean
  resume?: string
}

export interface OrchestratorConfig {
  name: string
  project_root?: string
  defaults?: DefaultsConfig
  concurrency?: { max: number }
  logging?: { dir: string; per_task: boolean }
  persistence?: { file: string }
  triggers: TriggerConfig[]
  pipelines: Record<string, PipelineDef>
}

export interface TriggerConfig {
  name: string
  type: string
  gitlab: { project: string; url?: string; labels?: string[]; username?: string; watch_jobs?: string[] }
  poll_interval: string
  priority: number
  pipeline: string
}

export interface PipelineDef {
  state?: StateConfig
  stop_labels?: string[]
  steps: StepConfig[]
}

export interface StateConfig {
  on_start?: StateTransition
  on_success?: StateTransition
  on_failure?: StateTransition
  on_needs_human?: StateTransition
}

export interface StateTransition {
  remove_labels?: string[]
  add_labels?: string[]
  close_issue?: boolean
}

// ── Runtime types ────────────────────────────────────────────────

export interface RunResult {
  exitCode: number
  durationMs: number
  error?: string
  output?: string
  sessionId?: string
}

export interface RunRecord {
  id: string
  pipeline: string
  config: string
  status: 'running' | 'success' | 'failure' | 'canceled' | 'stale'
  started_at: string
  ended_at?: string
  duration?: string
  error?: string
  steps: StepRecord[]
  ssh?: { host: string; user: string; port: number }
  tmux?: { session: string; log_file: string; ttl: string; attach: string }
  meta?: Record<string, string>
}

export interface StepRecord {
  name: string
  status: string
  duration?: string
  exit_code: number
  error?: string
  output?: string
  session_id?: string
}

// ── Pipeline events (sent to renderer via IPC) ───────────────────

export type PipelineEvent =
  | { type: 'pipeline:started'; runId: string; pipeline: string }
  | { type: 'step:started'; stepName: string; command: string }
  | { type: 'step:output'; stepName: string; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'step:completed'; stepName: string; result: RunResult }
  | { type: 'step:failed'; stepName: string; result: RunResult }
  | { type: 'step:retry'; stepName: string; attempt: number; maxAttempts: number }
  | { type: 'iteration:started'; iteration: number }
  | { type: 'pipeline:completed'; runId: string; duration: string }
  | { type: 'pipeline:failed'; runId: string; error: string }
  | { type: 'pipeline:canceled'; runId: string }

export type EngineStatus = 'stopped' | 'running' | 'error'
