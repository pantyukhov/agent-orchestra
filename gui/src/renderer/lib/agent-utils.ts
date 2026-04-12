// gui/src/renderer/lib/agent-utils.ts
import type { RunRecord } from '../types/state'

const GRADIENTS = [
  { from: '#5e5ce6', to: '#bf5af2' },
  { from: '#ff9f0a', to: '#ff6723' },
  { from: '#ff375f', to: '#ff2d55' },
  { from: '#64d2ff', to: '#5ac8fa' },
  { from: '#30d158', to: '#34c759' },
  { from: '#ff6482', to: '#ffd60a' },
  { from: '#0a84ff', to: '#5e5ce6' },
  { from: '#ac8e68', to: '#d4a574' }
]

export type AgentStatus = 'running' | 'success' | 'failed' | 'stale' | 'idle'

export interface AgentViewModel {
  name: string
  initials: string
  gradient: { from: string; to: string }
  configPath: string
  status: AgentStatus
  successRate: number
  lastRunTime?: string
  lastRunRelative: string
  runs: RunRecord[]
}

export function getInitials(name: string): string {
  if (!name) return ''
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function getGradient(name: string): { from: string; to: string } {
  return GRADIENTS[hashName(name) % GRADIENTS.length]
}

export function getAgentStatus(runs: RunRecord[]): AgentStatus {
  if (runs.length === 0) return 'idle'
  const latest = runs[0]
  switch (latest.status) {
    case 'running': return 'running'
    case 'success': return 'success'
    case 'failure': return 'failed'
    case 'stale': return 'stale'
    case 'canceled': return 'idle'
    default: return 'idle'
  }
}

export function getSuccessRate(runs: RunRecord[]): number {
  const completed = runs.filter(r => r.status === 'success' || r.status === 'failure')
  if (completed.length === 0) return 0
  const success = completed.filter(r => r.status === 'success').length
  return Math.round((success / completed.length) * 100)
}

export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function buildAgentViewModel(
  configPath: string,
  name: string,
  allRuns: RunRecord[]
): AgentViewModel {
  const runs = allRuns
    .filter(r => r.config === configPath)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))

  return {
    name,
    initials: getInitials(name),
    gradient: getGradient(name),
    configPath,
    status: getAgentStatus(runs),
    successRate: getSuccessRate(runs),
    lastRunTime: runs[0]?.ended_at ?? runs[0]?.started_at,
    lastRunRelative: formatRelativeTime(runs[0]?.ended_at ?? runs[0]?.started_at),
    runs
  }
}
