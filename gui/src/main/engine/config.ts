import { readFileSync } from 'fs'
import yaml from 'js-yaml'
import type { Config, StepConfig, DefaultsConfig, SSHConfig } from './types'

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf-8')
  const cfg = yaml.load(raw) as Config
  if (!cfg) throw new Error('Empty config file')
  if (cfg.pipeline) validatePipeline(cfg)
  else if (cfg.orchestrator) validateOrchestrator(cfg)
  else throw new Error("Config must have 'pipeline' or 'orchestrator' section")
  return cfg
}

function validatePipeline(cfg: Config) {
  const p = cfg.pipeline!
  if (!p.name) throw new Error('pipeline.name is required')
  if (!p.steps || p.steps.length === 0) throw new Error('pipeline.steps must have at least one step')
  if (p.loop?.delay) parseDuration(p.loop.delay)
  if (p.defaults?.timeout) parseDuration(p.defaults.timeout)
  if (p.defaults?.on_error) validateOnError(p.defaults.on_error)
  validateSteps(p.steps, p.defaults || {})
}

function validateOrchestrator(cfg: Config) {
  const o = cfg.orchestrator!
  if (!o.name) throw new Error('orchestrator.name is required')
  if (!o.triggers?.length) throw new Error('at least one trigger is required')
  if (!o.pipelines || Object.keys(o.pipelines).length === 0) throw new Error('at least one pipeline is required')
  for (const t of o.triggers) {
    if (!t.name) throw new Error('trigger.name is required')
    if (!t.pipeline) throw new Error(`trigger ${t.name}: pipeline is required`)
    if (!o.pipelines[t.pipeline]) throw new Error(`trigger ${t.name}: pipeline "${t.pipeline}" not found`)
    if (t.poll_interval) parseDuration(t.poll_interval)
  }
}

function validateSteps(steps: StepConfig[], defaults: DefaultsConfig) {
  for (const s of steps) {
    if (s.group) {
      if (!s.steps?.length) throw new Error(`group "${s.group}": must have nested steps`)
      if (s.loop?.delay) parseDuration(s.loop.delay)
      validateSteps(s.steps, defaults)
      continue
    }
    if (s.action) continue
    if (!s.name) throw new Error('step must have name, group, or action')
    const cmd = s.command || defaults.command
    if (!cmd) throw new Error(`step "${s.name}": command is required`)
    if (s.timeout) parseDuration(s.timeout)
    if (s.on_error) validateOnError(s.on_error)
    if (s.retry_delay) parseDuration(s.retry_delay)
    if (s.loop?.delay) parseDuration(s.loop.delay)
  }
}

function validateOnError(v: string) {
  if (!['stop', 'continue', 'retry'].includes(v)) {
    throw new Error(`on_error must be stop, continue, or retry (got "${v}")`)
  }
}

// ── Resolution helpers ──────────────────────────────────────────

export function resolveCommand(step: StepConfig, defaults: DefaultsConfig): [string, string[]] {
  const cmd = step.command || defaults.command || ''
  let args = step.args ? [...step.args] : defaults.args ? [...defaults.args] : []
  if (step.prompt) args.push(step.prompt)
  return [cmd, args]
}

export function resolveEnv(step: StepConfig, defaults: DefaultsConfig): Record<string, string> | undefined {
  if (!defaults.env && !step.env) return undefined
  return { ...defaults.env, ...step.env }
}

export function resolveWorkingDir(step: StepConfig, defaults: DefaultsConfig): string | undefined {
  return step.working_dir || defaults.working_dir
}

export function resolveTimeout(step: StepConfig, defaults: DefaultsConfig): number {
  const s = step.timeout || defaults.timeout
  return s ? parseDuration(s) : 0
}

export function resolveOnError(step: StepConfig, defaults: DefaultsConfig): string {
  return step.on_error || defaults.on_error || 'stop'
}

export function resolveSSH(step: StepConfig, defaults: DefaultsConfig): SSHConfig | undefined {
  return step.ssh || defaults.ssh
}

// ── Duration parsing (Go-compatible) ────────────────────────────

export function parseDuration(s: string): number {
  if (!s) return 0
  const re = /^(\d+)(ms|s|m|h|d)$/
  const m = s.match(re)
  if (!m) throw new Error(`invalid duration "${s}"`)
  const n = parseInt(m[1])
  switch (m[2]) {
    case 'ms': return n
    case 's': return n * 1000
    case 'm': return n * 60_000
    case 'h': return n * 3_600_000
    case 'd': return n * 86_400_000
    default: return 0
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  let parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join('')
}
