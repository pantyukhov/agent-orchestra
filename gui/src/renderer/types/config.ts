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
  on_error?: 'stop' | 'continue' | 'retry' | ''
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
  on_error?: 'stop' | 'continue' | 'retry' | ''
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
  capture_output?: boolean
  loop?: LoopConfig
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
  type: 'gitlab-issues' | 'gitlab-ci'
  gitlab: GitLabConfig
  poll_interval: string
  priority: number
  pipeline: string
}

export interface GitLabConfig {
  project: string
  url?: string
  labels?: string[]
  username?: string
  watch_jobs?: string[]
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
