import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Workspace
  openWorkspace: () => ipcRenderer.invoke('workspace:open'),
  getWorkspaceConfigs: (dir: string) => ipcRenderer.invoke('workspace:configs', dir),
  getWorkspaceHistory: (dir: string) => ipcRenderer.invoke('workspace:history', dir),
  getRecentWorkspaces: () => ipcRenderer.invoke('workspace:recent'),

  // Config
  openConfigFile: () => ipcRenderer.invoke('config:open'),
  loadConfigFile: (path: string) => ipcRenderer.invoke('config:load', path),
  saveConfigFile: (path: string, config: unknown) => ipcRenderer.invoke('config:save', path, config),
  createNewConfig: (dir: string, mode: string) => ipcRenderer.invoke('config:create', dir, mode),

  // Process
  startProcess: (configPath: string, once: boolean) => ipcRenderer.invoke('process:start', configPath, once),
  stopProcess: () => ipcRenderer.invoke('process:stop'),
  getProcessStatus: () => ipcRenderer.invoke('process:status'),
  onProcessOutput: (callback: (data: string) => void) => {
    const handler = (_e: unknown, data: string) => callback(data)
    ipcRenderer.on('process:output', handler)
    return () => ipcRenderer.removeListener('process:output', handler)
  },
  onProcessStatusChange: (callback: (status: string) => void) => {
    const handler = (_e: unknown, status: string) => callback(status)
    ipcRenderer.on('engine:status', handler)
    return () => ipcRenderer.removeListener('engine:status', handler)
  },
  onEngineEvent: (callback: (event: unknown) => void) => {
    const handler = (_e: unknown, event: unknown) => callback(event)
    ipcRenderer.on('engine:event', handler)
    return () => ipcRenderer.removeListener('engine:event', handler)
  },

  // State (legacy — kept for orchestrator mode)
  watchState: (statePath: string) => ipcRenderer.invoke('state:watch', statePath),
  unwatchState: () => ipcRenderer.invoke('state:unwatch'),
  onStateUpdate: (callback: (state: unknown) => void) => {
    const handler = (_e: unknown, state: unknown) => callback(state)
    ipcRenderer.on('state:update', handler)
    return () => ipcRenderer.removeListener('state:update', handler)
  },

  // Logs
  getLogFiles: (logDir: string) => ipcRenderer.invoke('logs:files', logDir),
  readLogFile: (path: string) => ipcRenderer.invoke('logs:read', path),
  tailLogFile: (path: string) => ipcRenderer.invoke('logs:tail', path),
  untailLogFile: () => ipcRenderer.invoke('logs:untail'),
  onLogLine: (callback: (line: string) => void) => {
    const handler = (_e: unknown, line: string) => callback(line)
    ipcRenderer.on('logs:line', handler)
    return () => ipcRenderer.removeListener('logs:line', handler)
  },
  onLogFilesChanged: (callback: (files: unknown[]) => void) => {
    const handler = (_e: unknown, files: unknown[]) => callback(files)
    ipcRenderer.on('logs:files-changed', handler)
    return () => ipcRenderer.removeListener('logs:files-changed', handler)
  },

  // Utility
  selectDirectory: () => ipcRenderer.invoke('util:select-dir'),
  showInFolder: (path: string) => ipcRenderer.invoke('util:show-in-folder', path),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // Scheduler
  getScheduledJobs: () => ipcRenderer.invoke('scheduler:jobs')
})
