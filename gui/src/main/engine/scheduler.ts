import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { startEngine } from './index'
import type { Config } from './types'

interface ScheduledJob {
  configPath: string
  cron: string
  name: string
  timer?: NodeJS.Timeout
}

const jobs: ScheduledJob[] = []
let scanInterval: NodeJS.Timeout | null = null

/** Start scanning workspace for scheduled pipelines */
export function startScheduler(workspacePath: string) {
  stopScheduler()
  scanAndSchedule(workspacePath)
  // Re-scan every 60s for config changes
  scanInterval = setInterval(() => scanAndSchedule(workspacePath), 60_000)
}

export function stopScheduler() {
  for (const job of jobs) {
    if (job.timer) clearInterval(job.timer)
  }
  jobs.length = 0
  if (scanInterval) {
    clearInterval(scanInterval)
    scanInterval = null
  }
}

function scanAndSchedule(workspacePath: string) {
  const configDir = join(workspacePath, 'configs')
  let files: string[]
  try {
    files = readdirSync(configDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
  } catch {
    return
  }

  // Clear old jobs
  for (const job of jobs) {
    if (job.timer) clearInterval(job.timer)
  }
  jobs.length = 0

  for (const file of files) {
    const configPath = join(configDir, file)
    try {
      const raw = readFileSync(configPath, 'utf-8')
      const config = yaml.load(raw) as Config
      const schedule = config?.pipeline?.schedule
      if (!schedule) continue

      const job: ScheduledJob = {
        configPath,
        cron: schedule,
        name: config.pipeline!.name || file
      }

      // Check every minute if cron matches
      job.timer = setInterval(() => {
        if (cronMatches(job.cron)) {
          console.log(`[Scheduler] Running ${job.name} (${job.cron})`)
          startEngine(job.configPath)
        }
      }, 60_000)

      // Also check immediately on startup
      if (cronMatches(job.cron)) {
        console.log(`[Scheduler] Running ${job.name} now (matches current time)`)
        startEngine(job.configPath)
      }

      jobs.push(job)
      console.log(`[Scheduler] Registered: ${job.name} — ${job.cron}`)
    } catch {
      // skip invalid configs
    }
  }
}

/** Check if a 5-field cron expression matches the current minute */
function cronMatches(cron: string): boolean {
  const now = new Date()
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const [minute, hour, dom, month, dow] = parts

  return (
    fieldMatches(minute, now.getMinutes()) &&
    fieldMatches(hour, now.getHours()) &&
    fieldMatches(dom, now.getDate()) &&
    fieldMatches(month, now.getMonth() + 1) &&
    fieldMatches(dow, now.getDay())
  )
}

function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true

  // */N — every N
  if (field.startsWith('*/')) {
    const n = parseInt(field.slice(2))
    return n > 0 && value % n === 0
  }

  // comma-separated values: 1,3,5
  const values = field.split(',')
  for (const v of values) {
    // range: 1-5
    if (v.includes('-')) {
      const [from, to] = v.split('-').map(Number)
      if (value >= from && value <= to) return true
    } else {
      if (parseInt(v) === value) return true
    }
  }

  return false
}

export function getScheduledJobs(): { name: string; cron: string; configPath: string }[] {
  return jobs.map(j => ({ name: j.name, cron: j.cron, configPath: j.configPath }))
}
