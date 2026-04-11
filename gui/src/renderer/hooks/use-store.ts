import { create } from 'zustand'
import type { Config } from '../types/config'
import type { OrchestratorState, ProcessStatus, LogFileInfo } from '../types/state'

type Page = 'welcome' | 'config' | 'execution' | 'logs'

interface AppState {
  // Navigation
  page: Page
  setPage: (page: Page) => void

  // Config
  configPath: string | null
  config: Config | null
  dirty: boolean
  setConfig: (path: string, config: Config) => void
  updateConfig: (config: Config) => void
  setDirty: (dirty: boolean) => void
  clearConfig: () => void

  // Process
  processStatus: ProcessStatus
  processOutput: string[]
  setProcessStatus: (status: ProcessStatus) => void
  appendOutput: (line: string) => void
  clearOutput: () => void

  // State
  orchestratorState: OrchestratorState | null
  setOrchestratorState: (state: OrchestratorState) => void

  // Logs
  logFiles: LogFileInfo[]
  selectedLog: string | null
  logContent: string
  setLogFiles: (files: LogFileInfo[]) => void
  setSelectedLog: (path: string | null) => void
  setLogContent: (content: string) => void
}

export const useStore = create<AppState>((set) => ({
  page: 'welcome',
  setPage: (page) => set({ page }),

  configPath: null,
  config: null,
  dirty: false,
  setConfig: (path, config) => set({ configPath: path, config, dirty: false, page: 'config' }),
  updateConfig: (config) => set({ config, dirty: true }),
  setDirty: (dirty) => set({ dirty }),
  clearConfig: () => set({ configPath: null, config: null, dirty: false, page: 'welcome' }),

  processStatus: 'stopped',
  processOutput: [],
  setProcessStatus: (processStatus) => set({ processStatus }),
  appendOutput: (line) =>
    set((s) => ({
      processOutput: [...s.processOutput.slice(-5000), line]
    })),
  clearOutput: () => set({ processOutput: [] }),

  orchestratorState: null,
  setOrchestratorState: (orchestratorState) => set({ orchestratorState }),

  logFiles: [],
  selectedLog: null,
  logContent: '',
  setLogFiles: (logFiles) => set({ logFiles }),
  setSelectedLog: (selectedLog) => set({ selectedLog }),
  setLogContent: (logContent) => set({ logContent })
}))
