import { spawn } from 'child_process'
import { createInterface } from 'readline'
import type { RunResult, StepConfig, DefaultsConfig } from './types'
import { resolveCommand, resolveEnv, resolveWorkingDir, resolveTimeout } from './config'

export async function runLocal(
  step: StepConfig,
  defaults: DefaultsConfig,
  signal: AbortSignal,
  onOutput: (stream: 'stdout' | 'stderr', line: string) => void,
  sessionIds?: Record<string, string>
): Promise<RunResult> {
  const [command, args] = resolveCommand(step, defaults, sessionIds)
  const env = resolveEnv(step, defaults)
  const cwd = resolveWorkingDir(step, defaults)
  const timeoutMs = resolveTimeout(step, defaults)

  const start = Date.now()
  let outputBuf = ''

  return new Promise<RunResult>((resolve) => {
    if (signal.aborted) {
      return resolve({ exitCode: -1, durationMs: 0, error: 'canceled' })
    }

    const proc = spawn(command, args, {
      cwd: cwd || undefined,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Timeout
    let timeoutTimer: NodeJS.Timeout | undefined
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        proc.kill('SIGINT')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }, timeoutMs)
    }

    // Abort signal
    const onAbort = () => {
      proc.kill('SIGINT')
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 5000)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    // Read stdout
    const rlOut = createInterface({ input: proc.stdout! })
    rlOut.on('line', (line) => {
      onOutput('stdout', line)
      if (step.capture_output) outputBuf += line + '\n'
    })

    // Read stderr
    const rlErr = createInterface({ input: proc.stderr! })
    rlErr.on('line', (line) => onOutput('stderr', line))

    proc.on('close', (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      signal.removeEventListener('abort', onAbort)

      const durationMs = Date.now() - start
      const exitCode = code ?? -1

      if (signal.aborted) {
        resolve({ exitCode, durationMs, error: 'canceled' })
      } else if (exitCode !== 0) {
        resolve({ exitCode, durationMs, error: `exit code ${exitCode}`, output: step.capture_output ? outputBuf : undefined })
      } else {
        resolve({ exitCode: 0, durationMs, output: step.capture_output ? outputBuf : undefined })
      }
    })

    proc.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      signal.removeEventListener('abort', onAbort)
      resolve({ exitCode: -1, durationMs: Date.now() - start, error: err.message })
    })
  })
}
