import { readdirSync, statSync, readFileSync, watch, FSWatcher, createReadStream } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { createInterface } from 'readline'

let dirWatcher: FSWatcher | null = null
let tailStream: ReturnType<typeof createReadStream> | null = null

export interface LogFileInfo {
  name: string
  path: string
  size: number
  mtime: string
}

export function getLogFiles(logDir: string): LogFileInfo[] {
  try {
    const entries = readdirSync(logDir)
    return entries
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const fullPath = join(logDir, f)
        const st = statSync(fullPath)
        return { name: f, path: fullPath, size: st.size, mtime: st.mtime.toISOString() }
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
  } catch {
    return []
  }
}

export function readLogFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

export function watchLogDir(logDir: string): void {
  unwatchLogDir()
  try {
    dirWatcher = watch(logDir, () => {
      const files = getLogFiles(logDir)
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('logs:files-changed', files)
      }
    })
  } catch {
    // Dir might not exist yet
  }
}

export function unwatchLogDir(): void {
  if (dirWatcher) {
    dirWatcher.close()
    dirWatcher = null
  }
  untailLogFile()
}

export function tailLogFile(path: string): void {
  untailLogFile()
  try {
    const st = statSync(path)
    tailStream = createReadStream(path, { start: st.size, encoding: 'utf-8' })
    const rl = createInterface({ input: tailStream })
    rl.on('line', (line) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('logs:line', line)
      }
    })
  } catch {
    // ignore
  }
}

export function untailLogFile(): void {
  if (tailStream) {
    tailStream.destroy()
    tailStream = null
  }
}
