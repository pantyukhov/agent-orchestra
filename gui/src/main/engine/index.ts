import { join, dirname } from 'path'
import { BrowserWindow } from 'electron'
import type { Config, PipelineEvent, EngineStatus, DefaultsConfig } from './types'
import { loadConfig } from './config'
import { executePipeline } from './pipeline'
import { HistoryStore } from './history'

let abortController: AbortController | null = null
let status: EngineStatus = 'stopped'

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

export async function startEngine(configPath: string): Promise<void> {
  // Kill previous if running
  if (abortController) {
    abortController.abort()
    abortController = null
  }

  setStatus('running')
  abortController = new AbortController()

  try {
    const config = loadConfig(configPath)

    if (config.pipeline) {
      const historyDir = join(dirname(configPath), '..', '.history')
      const history = new HistoryStore(historyDir)

      await executePipeline(config.pipeline, {
        defaults: config.pipeline.defaults || {},
        signal: abortController.signal,
        data: {},
        history,
        emit: emitEvent
      })
    } else {
      throw new Error('Only pipeline mode is supported in the GUI engine. Use the CLI for orchestrator mode.')
    }

    setStatus('stopped')
  } catch (err: any) {
    if (err.message === 'canceled' || abortController?.signal.aborted) {
      setStatus('stopped')
    } else {
      setStatus('error')
      emitEvent({ type: 'pipeline:failed', runId: '', error: err.message })
    }
  } finally {
    abortController = null
  }
}

export function stopEngine(): void {
  if (abortController) {
    abortController.abort()
  }
}

export function getEngineStatus(): EngineStatus {
  return status
}
