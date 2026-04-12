export interface OrchestratorState {
  locks: Record<string, LockEntry>
  ci_seen: Record<string, string>
  poll_count: number
  started_at: string
}

export interface LockEntry {
  pipeline: string
  started_at: string
}

export type ProcessStatus = 'stopped' | 'running' | 'error'

export interface LogFileInfo {
  name: string
  path: string
  size: number
  mtime: string
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
  tmux?: {
    session: string
    log_file: string
    ttl: string
    attach: string
  }
  meta?: Record<string, string>
}

export interface StepRecord {
  name: string
  status: string
  duration?: string
  exit_code: number
  error?: string
  output?: string
}

export interface WorkspaceInfo {
  path: string
  configs: string[]
  history: RunRecord[]
}
