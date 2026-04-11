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
