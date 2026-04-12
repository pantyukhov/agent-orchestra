import { ipcMain, dialog, shell, app } from 'electron'
import { join, dirname } from 'path'
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import yaml from 'js-yaml'
import { loadConfig, saveConfig, createDefaultConfig } from './config-manager'
import { startEngine, stopEngine, getEngineStatus } from './engine/index'
import { getLogFiles, readLogFile, tailLogFile, untailLogFile, watchLogDir } from './log-watcher'

// Persist recent workspaces to disk
const settingsPath = join(app.getPath('userData'), 'settings.json')

function loadSettings(): { recentWorkspaces: string[] } {
  try {
    const data = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { recentWorkspaces: [] }
  }
}

function saveSettings(settings: { recentWorkspaces: string[] }) {
  try {
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

const settings = loadSettings()
const recentWorkspaces: string[] = settings.recentWorkspaces

function addRecent(path: string) {
  const idx = recentWorkspaces.indexOf(path)
  if (idx !== -1) recentWorkspaces.splice(idx, 1)
  recentWorkspaces.unshift(path)
  if (recentWorkspaces.length > 10) recentWorkspaces.pop()
  saveSettings({ recentWorkspaces })
}

function findYamlFiles(dir: string): string[] {
  const results: string[] = []
  const scan = (d: string) => {
    try {
      const entries = readdirSync(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const full = join(d, entry.name)
        if (entry.isDirectory()) {
          scan(full)
        } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
          results.push(full)
        }
      }
    } catch {
      // permission denied, etc.
    }
  }
  scan(dir)
  return results.sort()
}

function loadHistory(workspaceDir: string): unknown[] {
  const historyDir = join(workspaceDir, '.history')
  if (!existsSync(historyDir)) return []

  try {
    const entries = readdirSync(historyDir)
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const data = readFileSync(join(historyDir, f), 'utf-8')
          return JSON.parse(data)
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.started_at || '').localeCompare(a.started_at || ''))
  } catch {
    return []
  }
}

export function registerIpcHandlers(): void {
  // Workspace
  ipcMain.handle('workspace:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    addRecent(dir)
    return dir
  })

  ipcMain.handle('workspace:configs', (_e, dir: string) => {
    return findYamlFiles(dir)
  })

  ipcMain.handle('workspace:history', (_e, dir: string) => {
    return loadHistory(dir)
  })

  ipcMain.handle('workspace:recent', () => recentWorkspaces)

  // Config
  ipcMain.handle('config:open', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const content = loadConfig(path)
    return { path, content }
  })

  ipcMain.handle('config:load', (_e, path: string) => {
    return loadConfig(path)
  })

  ipcMain.handle('config:save', (_e, path: string, config: unknown) => {
    saveConfig(path, config as any)
  })

  ipcMain.handle('config:create', async (_e, dir: string, mode: 'pipeline' | 'orchestrator') => {
    const config = createDefaultConfig(mode)
    const filename = mode === 'pipeline' ? 'pipeline.yaml' : 'orchestrator.yaml'
    const filePath = join(dir, filename)
    const content = yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true })
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  })

  // Engine (replaces process-manager)
  ipcMain.handle('process:start', (_e, configPath: string, _once: boolean) => {
    startEngine(configPath)  // fire-and-forget, events via IPC
  })

  ipcMain.handle('process:stop', () => {
    stopEngine()
  })

  ipcMain.handle('process:status', () => {
    return getEngineStatus()
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
