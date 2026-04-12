import type { PipelineConfig, StepConfig, DefaultsConfig, RunResult, PipelineEvent } from './types'
import { resolveOnError, resolveSSH, parseDuration, formatDuration } from './config'
import { runLocal } from './runner'
import { runSSH } from './ssh-runner'
import { renderStep, ensureStepEntries } from './template'
import { HistoryStore } from './history'

export interface PipelineContext {
  defaults: DefaultsConfig
  signal: AbortSignal
  data: Record<string, any>
  history: HistoryStore
  emit: (event: PipelineEvent) => void
  runId?: string
}

export async function executePipeline(
  config: PipelineConfig,
  ctx: PipelineContext
): Promise<void> {
  ensureStepEntries(ctx.data, config.steps)

  const record = ctx.history.start(config.name, '')
  ctx.runId = record.id
  ctx.emit({ type: 'pipeline:started', runId: record.id, pipeline: config.name })

  // Record SSH/tmux info
  if (ctx.defaults.ssh) {
    record.ssh = { host: ctx.defaults.ssh.host, user: ctx.defaults.ssh.user, port: ctx.defaults.ssh.port || 22 }
    if (ctx.defaults.ssh.tmux) {
      const session = `${ctx.defaults.ssh.tmux.session || config.name}-${record.id}`
      const logDir = ctx.defaults.ssh.tmux.log_dir || '/tmp/agent-orchestra'
      record.tmux = {
        session,
        log_file: `${logDir}/${session}.log`,
        ttl: ctx.defaults.ssh.tmux.ttl || '72h',
        attach: `ssh ${ctx.defaults.ssh.user}@${ctx.defaults.ssh.host} -t 'tmux attach -t ${session}'`
      }
    }
    ctx.history.addStep(record, { name: '_init', status: 'success', exit_code: 0 }) // persist SSH info
  }

  const loopCount = config.loop?.count ?? 1
  const loopDelay = config.loop?.delay ? parseDuration(config.loop.delay) : 0
  const infinite = (config.loop?.count ?? 0) === 0

  try {
    for (let i = 1; infinite || i <= loopCount; i++) {
      if (ctx.signal.aborted) throw new Error('canceled')

      ctx.emit({ type: 'iteration:started', iteration: i })
      await runSteps(config.steps, ctx, record)

      if (loopDelay > 0 && (infinite || i < loopCount)) {
        await sleep(loopDelay, ctx.signal)
      }
    }

    ctx.history.finish(record)
    ctx.emit({ type: 'pipeline:completed', runId: record.id, duration: record.duration || '' })
  } catch (err: any) {
    if (ctx.signal.aborted || err.message === 'canceled') {
      ctx.history.cancel(record)
      ctx.emit({ type: 'pipeline:canceled', runId: record.id })
    } else {
      ctx.history.finish(record, err)
      ctx.emit({ type: 'pipeline:failed', runId: record.id, error: err.message })
    }
    throw err
  }
}

async function runSteps(
  steps: StepConfig[],
  ctx: PipelineContext,
  record: any
): Promise<void> {
  for (const step of steps) {
    if (ctx.signal.aborted) throw new Error('canceled')

    const rendered = renderStep(step, ctx.data)

    if (rendered.group) {
      await runGroup(rendered, ctx, record)
    } else if (rendered.action) {
      // Actions (git-save, git-checkout, etc.) — skip for now, log warning
      ctx.emit({ type: 'step:output', stepName: rendered.action, stream: 'stderr', line: `Action "${rendered.action}" not yet supported in GUI engine` })
    } else {
      const result = await runAgent(rendered, ctx)
      const onError = resolveOnError(rendered, ctx.defaults)

      // Record in history
      ctx.history.addStep(record, {
        name: rendered.name || 'unnamed',
        status: result.error ? 'failure' : 'success',
        duration: formatDuration(result.durationMs),
        exit_code: result.exitCode,
        error: result.error,
        output: result.output ? result.output.slice(0, 4096) : undefined
      })

      // Store output for templates
      if (step.capture_output && result.output) {
        if (!ctx.data.steps) ctx.data.steps = {}
        ctx.data.steps[step.name || ''] = {
          output: result.output,
          exit_code: String(result.exitCode)
        }
      }

      if (result.error) {
        if (onError === 'continue') continue
        throw new Error(`step "${rendered.name}" failed: ${result.error}`)
      }
    }
  }
}

async function runGroup(group: StepConfig, ctx: PipelineContext, record: any): Promise<void> {
  const count = group.loop?.count || 1
  const delay = group.loop?.delay ? parseDuration(group.loop.delay) : 0

  for (let i = 1; i <= count; i++) {
    if (ctx.signal.aborted) throw new Error('canceled')
    await runSteps(group.steps || [], ctx, record)
    if (delay > 0 && i < count) await sleep(delay, ctx.signal)
  }
}

async function runAgent(step: StepConfig, ctx: PipelineContext): Promise<RunResult> {
  const onError = resolveOnError(step, ctx.defaults)
  const retries = onError === 'retry' && step.retry_count ? step.retry_count : 1
  const retryDelay = step.retry_delay ? parseDuration(step.retry_delay) : 1000
  const sshCfg = resolveSSH(step, ctx.defaults)

  const [command, args] = [step.command || ctx.defaults.command || '', []]
  ctx.emit({ type: 'step:started', stepName: step.name || '', command: `${command} ${(step.args || ctx.defaults.args || []).join(' ')}` })

  let lastResult: RunResult = { exitCode: -1, durationMs: 0, error: 'no attempts' }

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (ctx.signal.aborted) throw new Error('canceled')

    if (attempt > 1) {
      ctx.emit({ type: 'step:retry', stepName: step.name || '', attempt, maxAttempts: retries })
      await sleep(retryDelay, ctx.signal)
    }

    const onOutput = (stream: 'stdout' | 'stderr', line: string) => {
      ctx.emit({ type: 'step:output', stepName: step.name || '', stream, line })
    }

    if (sshCfg?.host) {
      lastResult = await runSSH(step, ctx.defaults, sshCfg, ctx.signal, onOutput, ctx.runId)
    } else {
      lastResult = await runLocal(step, ctx.defaults, ctx.signal, onOutput)
    }

    if (!lastResult.error) {
      ctx.emit({ type: 'step:completed', stepName: step.name || '', result: lastResult })
      return lastResult
    }
  }

  ctx.emit({ type: 'step:failed', stepName: step.name || '', result: lastResult })
  return lastResult
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('canceled'))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('canceled')) }, { once: true })
  })
}
