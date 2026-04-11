import type { Config } from './config'
import type { OrchestratorState, ProcessStatus, LogFileInfo } from './state'

export interface ElectronAPI {
  openConfigFile(): Promise<{ path: string; content: Config } | null>
  saveConfigFile(path: string, config: Config): Promise<void>
  createNewConfig(dir: string, mode: 'pipeline' | 'orchestrator'): Promise<string>
  getRecentConfigs(): Promise<string[]>

  startProcess(configPath: string, once: boolean): Promise<void>
  stopProcess(): Promise<void>
  getProcessStatus(): Promise<ProcessStatus>
  onProcessOutput(callback: (data: string) => void): () => void
  onProcessStatusChange(callback: (status: ProcessStatus) => void): () => void

  watchState(statePath: string): Promise<void>
  unwatchState(): Promise<void>
  onStateUpdate(callback: (state: OrchestratorState) => void): () => void

  getLogFiles(logDir: string): Promise<LogFileInfo[]>
  readLogFile(path: string): Promise<string>
  tailLogFile(path: string): Promise<void>
  untailLogFile(): Promise<void>
  onLogLine(callback: (line: string) => void): () => void
  onLogFilesChanged(callback: (files: LogFileInfo[]) => void): () => void

  selectDirectory(): Promise<string | null>
  showInFolder(path: string): Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
