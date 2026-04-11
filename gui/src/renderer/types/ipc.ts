import type { Config } from './config'
import type { OrchestratorState, ProcessStatus, LogFileInfo, RunRecord } from './state'

export interface ElectronAPI {
  // Workspace
  openWorkspace(): Promise<string | null>
  getWorkspaceConfigs(dir: string): Promise<string[]>
  getWorkspaceHistory(dir: string): Promise<RunRecord[]>

  // Config
  openConfigFile(): Promise<{ path: string; content: Config } | null>
  loadConfigFile(path: string): Promise<Config>
  saveConfigFile(path: string, config: Config): Promise<void>
  createNewConfig(dir: string, mode: 'pipeline' | 'orchestrator'): Promise<string>
  getRecentWorkspaces(): Promise<string[]>

  // Process
  startProcess(configPath: string, once: boolean): Promise<void>
  stopProcess(): Promise<void>
  getProcessStatus(): Promise<ProcessStatus>
  onProcessOutput(callback: (data: string) => void): () => void
  onProcessStatusChange(callback: (status: ProcessStatus) => void): () => void

  // State
  watchState(statePath: string): Promise<void>
  unwatchState(): Promise<void>
  onStateUpdate(callback: (state: OrchestratorState) => void): () => void

  // Logs
  getLogFiles(logDir: string): Promise<LogFileInfo[]>
  readLogFile(path: string): Promise<string>
  tailLogFile(path: string): Promise<void>
  untailLogFile(): Promise<void>
  onLogLine(callback: (line: string) => void): () => void
  onLogFilesChanged(callback: (files: LogFileInfo[]) => void): () => void

  // Utility
  selectDirectory(): Promise<string | null>
  showInFolder(path: string): Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
