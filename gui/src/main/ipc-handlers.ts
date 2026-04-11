import { ipcMain, dialog, shell } from 'electron'
import { join, dirname } from 'path'
import { writeFileSync } from 'fs'
import yaml from 'js-yaml'
import { loadConfig, saveConfig, createDefaultConfig } from './config-manager'
import { startProcess, stopProcess, getProcessStatus } from './process-manager'
import { watchState, unwatchState } from './state-watcher'
import { getLogFiles, readLogFile, tailLogFile, untailLogFile, watchLogDir } from './log-watcher'

const recentConfigs: string[] = []

function addRecent(path: string) {
  const idx = recentConfigs.indexOf(path)
  if (idx !== -1) recentConfigs.splice(idx, 1)
  recentConfigs.unshift(path)
  if (recentConfigs.length > 10) recentConfigs.pop()
}

export function registerIpcHandlers(): void {
  // Config
  ipcMain.handle('config:open', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const content = loadConfig(path)
    addRecent(path)

    // Auto-watch logs if orchestrator config
    if (content.orchestrator?.logging?.dir) {
      const logDir = join(dirname(path), content.orchestrator.logging.dir)
      watchLogDir(logDir)
    }

    return { path, content }
  })

  ipcMain.handle('config:save', (_e, path: string, config: unknown) => {
    saveConfig(path, config as any)
    addRecent(path)
  })

  ipcMain.handle('config:create', async (_e, dir: string, mode: 'pipeline' | 'orchestrator') => {
    const config = createDefaultConfig(mode)
    const filename = mode === 'pipeline' ? 'pipeline.yaml' : 'orchestrator.yaml'
    const filePath = join(dir, filename)
    const content = yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true })
    writeFileSync(filePath, content, 'utf-8')
    addRecent(filePath)
    return filePath
  })

  ipcMain.handle('config:recent', () => recentConfigs)

  // Process
  ipcMain.handle('process:start', (_e, configPath: string, once: boolean) => {
    startProcess(configPath, once)
  })

  ipcMain.handle('process:stop', () => {
    stopProcess()
  })

  ipcMain.handle('process:status', () => {
    return getProcessStatus()
  })

  // State
  ipcMain.handle('state:watch', (_e, statePath: string) => {
    watchState(statePath)
  })

  ipcMain.handle('state:unwatch', () => {
    unwatchState()
  })

  // Logs
  ipcMain.handle('logs:files', (_e, logDir: string) => {
    return getLogFiles(logDir)
  })

  ipcMain.handle('logs:read', (_e, path: string) => {
    return readLogFile(path)
  })

  ipcMain.handle('logs:tail', (_e, path: string) => {
    tailLogFile(path)
  })

  ipcMain.handle('logs:untail', () => {
    untailLogFile()
  })

  // Utility
  ipcMain.handle('util:select-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('util:show-in-folder', (_e, path: string) => {
    shell.showItemInFolder(path)
  })
}
