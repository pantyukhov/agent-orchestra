import { readFileSync, watch, FSWatcher, existsSync } from 'fs'
import { BrowserWindow } from 'electron'

let watcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null

export function watchState(statePath: string): void {
  unwatchState()
  if (!existsSync(statePath)) return

  const send = () => {
    try {
      const raw = readFileSync(statePath, 'utf-8')
      const state = JSON.parse(raw)
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('state:update', state)
      }
    } catch {
      // File may be partially written, ignore
    }
  }

  send() // Initial read

  watcher = watch(statePath, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(send, 500)
  })
}

export function unwatchState(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}
