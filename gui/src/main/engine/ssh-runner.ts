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
  onOutput: (stream: 'stdout' | 'stderr', line: string) => void,
  runId?: string,
  sessionIds?: Record<string, string>
): Promise<RunResult> {
  const [command, args] = resolveCommand(step, defaults, sessionIds)
  const env = resolveEnv(step, defaults)
  const cwd = resolveWorkingDir(step, defaults)

  // Build script content and encode as base64 to avoid all quoting issues
  const scriptContent = buildScriptContent(command, args, env, cwd)
  const b64 = Buffer.from(scriptContent).toString('base64')

  const remoteCmd = sshCfg.tmux
    ? buildTmuxCommandB64(b64, sshCfg.tmux, step.name, runId)
    : `bash -c 'echo ${b64} | base64 -d | bash'`

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

        let resolved = false

        stream.on('data', (data: Buffer) => {
          stdoutBuf += data.toString()
          const lines = stdoutBuf.split('\n')
          stdoutBuf = lines.pop() || ''
          for (const line of lines) {
            onOutput('stdout', line)
            if (step.capture_output) outputBuf += line + '\n'

            // Parse JSON output — detect when Claude pipeline is done
            if (!resolved) {
              try {
                const parsed = JSON.parse(line)
                if (parsed.type === 'result') {
                  resolved = true
                  setTimeout(() => {
                    signal.removeEventListener('abort', onAbort)
                    conn.end()
                    resolve({ exitCode: 0, durationMs: Date.now() - start, output: step.capture_output ? outputBuf : undefined })
                  }, 300)
                }
              } catch {
                // not JSON — ignore
              }
            }
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

          // Parse session output when capture_output is enabled
          let finalOutput = step.capture_output ? outputBuf : undefined
          let sessionId: string | undefined
          if (step.capture_output && outputBuf) {
            const parsed = parseSessionOutput(outputBuf)
            finalOutput = parsed.cleanOutput
            sessionId = parsed.sessionId
          }

          if (signal.aborted) {
            resolve({ exitCode: -1, durationMs, error: 'canceled' })
          } else if (code !== 0) {
            resolve({ exitCode: code, durationMs, error: `exit code ${code}`, output: finalOutput, sessionId })
          } else {
            resolve({ exitCode: 0, durationMs, output: finalOutput, sessionId })
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

/** Build a bash script body — no quoting needed since it's written to a file or piped via base64 */
function buildScriptContent(command: string, args: string[], env?: Record<string, string>, cwd?: string): string {
  const lines: string[] = ['#!/bin/bash', 'set -e']
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      lines.push(`export ${k}=${shellQuote(v)}`)
    }
  }
  if (cwd) lines.push(`cd ${shellQuote(cwd)}`)
  // Build command with proper quoting for each arg
  const cmdParts = [shellQuote(command), ...args.map(shellQuote)]
  lines.push(cmdParts.join(' '))
  return lines.join('\n') + '\n'
}

function buildTmuxCommandB64(b64Script: string, tmux: TmuxConfig, stepName?: string, runId?: string): string {
  const baseName = tmux.session || stepName || 'agent'
  const session = runId ? `${baseName}-${runId}` : `${baseName}-${formatTimestamp()}`
  const logDir = tmux.log_dir || '/tmp/agent-orchestra'
  const logFile = `${logDir}/${session}.log`
  const scriptFile = `${logDir}/${session}.sh`
  const ttlStr = tmux.ttl || '72h'
  const ttlSec = Math.round(parseDuration(ttlStr) / 1000)

  return [
    `mkdir -p ${shellQuote(logDir)}; touch ${shellQuote(logFile)};`,
    `echo ${b64Script} | base64 -d > ${shellQuote(scriptFile)} && chmod +x ${shellQuote(scriptFile)};`,
    `tmux new-session -d -s ${shellQuote(session)} ${shellQuote(scriptFile)};`,
    `tmux pipe-pane -t ${shellQuote(session)} -o 'cat >> ${shellQuote(logFile)}';`,
    `nohup bash -c 'sleep ${ttlSec} && tmux kill-session -t ${shellQuote(session)}' >/dev/null 2>&1 &`,
    `tail -n +1 -f ${shellQuote(logFile)} & TAIL_PID=$!;`,
    `while tmux has-session -t ${shellQuote(session)} 2>/dev/null; do sleep 1; done;`,
    `kill $TAIL_PID 2>/dev/null; exit 0`
  ].join(' ')
}

function formatTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function parseSessionOutput(raw: string): { sessionId?: string; cleanOutput: string } {
  // Search from the end for a line starting with '{' that is valid JSON with session_id
  const lines = raw.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.session_id) {
          return {
            sessionId: parsed.session_id,
            cleanOutput: parsed.result || raw
          }
        }
      } catch {
        // Not valid JSON, continue searching
      }
    }
  }
  return { cleanOutput: raw }
}

function shellQuote(s: string): string {
  if (!s) return "''"
  if (/^[a-zA-Z0-9\-_.,/:=]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
