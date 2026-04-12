import { join, dirname } from 'path'
import { BrowserWindow, Notification, net } from 'electron'
import { loadSettings } from '../ipc-handlers'
import type { Config, PipelineEvent, EngineStatus, DefaultsConfig } from './types'
import { loadConfig } from './config'
import { executePipeline } from './pipeline'
import { HistoryStore } from './history'

let abortController: AbortController | null = null
let status: EngineStatus = 'stopped'
let runningPromise: Promise<void> | null = null
let currentRunId: string | undefined

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

function setStatus(s: EngineStatus) {
  status = s
  broadcast('engine:status', s)
}

function emitEvent(event: PipelineEvent) {
  broadcast('engine:event', event)
}

function notify(title: string, body: string) {
  const settings = loadSettings()

  // macOS notification (default on)
  if (settings.notifications?.mac !== false) {
    new Notification({ title, body }).show()
  }

  // Telegram
  const tg = settings.notifications?.telegram
  if (tg?.enabled && tg.botToken && tg.chatId) {
    const text = `*${title}*\n${body}`
    const url = `https://api.telegram.org/bot${tg.botToken}/sendMessage`
    const request = net.request({ method: 'POST', url })
    request.setHeader('Content-Type', 'application/json')
    request.write(JSON.stringify({ chat_id: tg.chatId, text, parse_mode: 'Markdown' }))
    request.end()
  }
}

export async function startEngine(configPath: string): Promise<void> {
  // Kill previous if running
  if (abortController) {
    abortController.abort()
    abortController = null
  }

  setStatus('running')
  abortController = new AbortController()

  const run = (async () => {
  try {
    const config = loadConfig(configPath)

    if (config.pipeline) {
      const historyDir = join(dirname(configPath), '..', '.history')
      const history = new HistoryStore(historyDir)
      history.markStaleRuns()

      await executePipeline(config.pipeline, {
        defaults: config.pipeline.defaults || {},
        signal: abortController.signal,
        data: {},
        history,
        sessionIds: {},
        emit: (event) => {
          if (event.type === 'pipeline:started') currentRunId = event.runId
          emitEvent(event)
        }
      })
    } else {
      throw new Error('Only pipeline mode is supported in the GUI engine. Use the CLI for orchestrator mode.')
    }

    setStatus('stopped')
    notify('Pipeline completed', `${config.pipeline.name} finished successfully`)
  } catch (err: any) {
    if (err.message === 'canceled' || abortController?.signal.aborted) {
      setStatus('stopped')
      notify('Pipeline canceled', `${configPath.split('/').pop()}`)
    } else {
      setStatus('error')
      notify('Pipeline failed', err.message)
      emitEvent({ type: 'pipeline:failed', runId: '', error: err.message })
    }
  } finally {
    abortController = null
    runningPromise = null
    currentRunId = undefined
  }
  })()

  runningPromise = run
  return run
}

export function stopEngine(): void {
  if (abortController) {
    abortController.abort()
  }
}

/** Abort and wait for the pipeline to finish cleanup (history writes, etc). */
export async function stopEngineAndWait(): Promise<void> {
  stopEngine()
  if (runningPromise) {
    await runningPromise.catch(() => {})
  }
}

export function getEngineStatus(): EngineStatus {
  return status
}

export function getCurrentRunId(): string | undefined {
  return currentRunId
}
