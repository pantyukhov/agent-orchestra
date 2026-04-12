import { Client, AgentProtocol } from 'ssh2'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createConnection } from 'net'
import { createPrivateKey } from 'crypto'
import type { RunResult, StepConfig, DefaultsConfig, SSHConfig, TmuxConfig } from './types'
import { resolveCommand, resolveEnv, resolveWorkingDir, parseDuration } from './config'

export async function runSSH(
  step: StepConfig,
  defaults: DefaultsConfig,
  sshCfg: SSHConfig,
  signal: AbortSignal,
  onOutput: (stream: 'stdout' | 'stderr', line: string) => void
): Promise<RunResult> {
  const [command, args] = resolveCommand(step, defaults)
  const env = resolveEnv(step, defaults)
  const cwd = resolveWorkingDir(step, defaults)

  const remoteCmd = sshCfg.tmux
    ? buildTmuxCommand(command, args, env, cwd, sshCfg.tmux, step.name)
    : buildRemoteCommand(command, args, env, cwd)

  const start = Date.now()
  let outputBuf = ''

  return new Promise<RunResult>((resolve) => {
    if (signal.aborted) {
      return resolve({ exitCode: -1, durationMs: 0, error: 'canceled' })
    }

    const conn = new Client()

    const onAbort = () => {
      conn.end()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    conn.on('ready', () => {
      conn.exec(remoteCmd, (err, stream) => {
        if (err) {
          signal.removeEventListener('abort', onAbort)
          conn.end()
          return resolve({ exitCode: -1, durationMs: Date.now() - start, error: `ssh exec: ${err.message}` })
        }

        let stdoutBuf = ''
        let stderrBuf = ''

        stream.on('data', (data: Buffer) => {
          stdoutBuf += data.toString()
          const lines = stdoutBuf.split('\n')
          stdoutBuf = lines.pop() || ''
          for (const line of lines) {
            onOutput('stdout', line)
            if (step.capture_output) outputBuf += line + '\n'
          }
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderrBuf += data.toString()
          const lines = stderrBuf.split('\n')
          stderrBuf = lines.pop() || ''
          for (const line of lines) {
            onOutput('stderr', line)
          }
        })

        stream.on('close', (code: number) => {
          // Flush remaining
          if (stdoutBuf) { onOutput('stdout', stdoutBuf); if (step.capture_output) outputBuf += stdoutBuf + '\n' }
          if (stderrBuf) onOutput('stderr', stderrBuf)

          signal.removeEventListener('abort', onAbort)
          conn.end()
          const durationMs = Date.now() - start

          if (signal.aborted) {
            resolve({ exitCode: -1, durationMs, error: 'canceled' })
          } else if (code !== 0) {
            resolve({ exitCode: code, durationMs, error: `exit code ${code}`, output: step.capture_output ? outputBuf : undefined })
          } else {
            resolve({ exitCode: 0, durationMs, output: step.capture_output ? outputBuf : undefined })
          }
        })
      })
    })

    conn.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      resolve({ exitCode: -1, durationMs: Date.now() - start, error: `ssh: ${err.message}` })
    })

    conn.connect({
      host: sshCfg.host,
      port: sshCfg.port || 22,
      username: sshCfg.user,
      ...buildAuth(sshCfg),
      readyTimeout: 30000
    })
  })
}

function buildAuth(cfg: SSHConfig): { privateKey?: string | Buffer; agent?: string; password?: string } {
  // Explicit key file
  if (cfg.key_file) {
    const keyPath = cfg.key_file.replace(/^~/, homedir())
    return { privateKey: convertKey(readFileSync(keyPath)) }
  }

  // Password
  let password = cfg.password
  if (cfg.password_env) password = process.env[cfg.password_env]
  if (password) return { password }

  // Auto-detect default keys
  for (const name of ['id_ed25519', 'id_rsa']) {
    try {
      const key = readFileSync(join(homedir(), '.ssh', name))
      return { privateKey: convertKey(key) }
    } catch { continue }
  }

  // Fallback to SSH agent
  const agentSock = process.env.SSH_AUTH_SOCK
  if (agentSock) return { agent: agentSock }

  return {}
}

/** Convert PKCS#8 or other formats to OpenSSH PEM format that ssh2 understands */
function convertKey(keyData: Buffer): string | Buffer {
  const keyStr = keyData.toString()
  // Already in OpenSSH format — return as-is
  if (keyStr.includes('BEGIN OPENSSH PRIVATE KEY') || keyStr.includes('BEGIN RSA PRIVATE KEY')) {
    return keyData
  }
  // PKCS#8 format (BEGIN PRIVATE KEY) — convert via Node crypto
  try {
    const keyObj = createPrivateKey(keyData)
    return keyObj.export({ type: 'pkcs1', format: 'pem' }) as string
  } catch {
    return keyData // fallback, let ssh2 try
  }
}

function buildRemoteCommand(command: string, args: string[], env?: Record<string, string>, cwd?: string): string {
  const parts: string[] = []
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      parts.push(`export ${k}=${shellQuote(v)};`)
    }
  }
  if (cwd) parts.push(`cd ${shellQuote(cwd)} &&`)
  parts.push(shellQuote(command))
  for (const a of args) parts.push(shellQuote(a))
  return parts.join(' ')
}

function buildTmuxCommand(command: string, args: string[], env: Record<string, string> | undefined, cwd: string | undefined, tmux: TmuxConfig, stepName?: string): string {
  let session = tmux.session || stepName || 'agent'
  session = `${session}-${formatTimestamp()}`
  const logDir = tmux.log_dir || '/tmp/agent-orchestra'
  const logFile = `${logDir}/${session}.log`
  const ttlStr = tmux.ttl || '72h'
  const ttlSec = Math.round(parseDuration(ttlStr) / 1000)

  const innerCmd = buildRemoteCommand(command, args, env, cwd)

  return [
    `mkdir -p ${shellQuote(logDir)}; touch ${shellQuote(logFile)};`,
    `tmux new-session -d -s ${shellQuote(session)} ${shellQuote(innerCmd)};`,
    `tmux pipe-pane -t ${shellQuote(session)} -o 'cat >> ${shellQuote(logFile)}';`,
    `(sleep ${ttlSec} && tmux kill-session -t ${shellQuote(session)} 2>/dev/null) & TTL_PID=$!;`,
    `tail -n +1 -f ${shellQuote(logFile)} & TAIL_PID=$!;`,
    `while tmux has-session -t ${shellQuote(session)} 2>/dev/null; do sleep 1; done;`,
    `sleep 1; kill $TAIL_PID $TTL_PID 2>/dev/null; wait $TAIL_PID 2>/dev/null; exit 0`
  ].join(' ')
}

function formatTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function shellQuote(s: string): string {
  if (!s) return "''"
  if (/^[a-zA-Z0-9\-_.,/:=]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
