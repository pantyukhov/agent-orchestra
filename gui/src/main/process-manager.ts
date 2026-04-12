import { ChildProcess, spawn } from 'child_process'
import { dirname } from 'path'
import { BrowserWindow } from 'electron'

let proc: ChildProcess | null = null
let status: 'stopped' | 'running' | 'error' = 'stopped'

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

function setStatus(s: typeof status) {
  status = s
  broadcast('process:status-change', s)
}

export function startProcess(configPath: string, once: boolean): void {
  // Kill previous process if still lingering
  if (proc) {
    try { proc.kill('SIGKILL') } catch {}
    proc = null
  }

  const args = ['-config', configPath]
  if (once) args.push('-once')

  const cwd = dirname(configPath)
  const bin = process.env.AGENT_ORCHESTRA_BIN || 'agent-orchestra'

  proc = spawn(bin, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  setStatus('running')

  proc.stdout?.on('data', (chunk: Buffer) => {
    broadcast('process:output', chunk.toString())
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    broadcast('process:output', chunk.toString())
  })

  proc.on('close', (code) => {
    proc = null
    setStatus(code === 0 || code === 130 ? 'stopped' : 'error')
  })

  proc.on('error', (err) => {
    proc = null
    setStatus('error')
    broadcast('process:output', `Error: ${err.message}\n`)
  })
}

export function stopProcess(): void {
  if (!proc) return
  proc.kill('SIGINT')
  setTimeout(() => {
    if (proc) {
      proc.kill('SIGTERM')
      setTimeout(() => {
        if (proc) {
          try { proc.kill('SIGKILL') } catch {}
          proc = null
          setStatus('stopped')
        }
      }, 5000)
    }
  }, 5000)
}

export function getProcessStatus(): typeof status {
  return status
}
