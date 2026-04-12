import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { RunRecord, StepRecord } from './types'
import { formatDuration } from './config'

export class HistoryStore {
  constructor(private dir: string) {}

  start(pipeline: string, configPath: string): RunRecord {
    mkdirSync(this.dir, { recursive: true })
    const now = new Date()
    const record: RunRecord = {
      id: formatId(now),
      pipeline,
      config: configPath,
      status: 'running',
      started_at: now.toISOString(),
      steps: []
    }
    this.save(record)
    return record
  }

  finish(record: RunRecord, error?: Error): void {
    const now = new Date()
    record.ended_at = now.toISOString()
    const startMs = new Date(record.started_at).getTime()
    record.duration = formatDuration(now.getTime() - startMs)
    if (error) {
      record.status = 'failure'
      record.error = error.message
    } else {
      record.status = 'success'
    }
    this.save(record)
  }

  cancel(record: RunRecord): void {
    const now = new Date()
    record.ended_at = now.toISOString()
    record.status = 'canceled'
    const startMs = new Date(record.started_at).getTime()
    record.duration = formatDuration(now.getTime() - startMs)
    this.save(record)
  }

  addStep(record: RunRecord, step: StepRecord): void {
    record.steps.push(step)
    this.save(record)
  }

  list(): RunRecord[] {
    try {
      const entries = readdirSync(this.dir)
      return entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          try {
            return JSON.parse(readFileSync(join(this.dir, f), 'utf-8')) as RunRecord
          } catch {
            return null
          }
        })
        .filter((r): r is RunRecord => r !== null)
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
    } catch {
      return []
    }
  }

  get(id: string): RunRecord | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, `${id}.json`), 'utf-8'))
    } catch {
      return null
    }
  }

  private save(record: RunRecord): void {
    writeFileSync(join(this.dir, `${record.id}.json`), JSON.stringify(record, null, 2), 'utf-8')
  }
}

function formatId(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
