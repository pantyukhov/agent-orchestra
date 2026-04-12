# Dashboard "My Agents" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WelcomePage with a DashboardPage showing agent cards with status/metrics and an activity timeline.

**Architecture:** New DashboardPage reads workspace configs via `getWorkspaceConfigs()` + `loadConfigFile()` per path, reads history via `getWorkspaceHistory()`, computes agent view models, and renders two sections: a horizontal card row and a timeline grid. Single-agent engine constraint is handled via disabled buttons UX.

**Tech Stack:** React 18, Zustand, Tailwind CSS, Motion (framer), lucide-react, Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-04-12-dashboard-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `gui/src/renderer/lib/agent-utils.ts` | Pure functions: initials extraction, gradient selection, hash function, status derivation, success rate, relative time |
| Create | `gui/src/renderer/lib/agent-utils.test.ts` | Unit tests for agent-utils (vitest or inline test runner) |
| Create | `gui/src/renderer/components/dashboard/AgentCard.tsx` | Single agent frosted-glass card with avatar, status, metrics, action buttons |
| Create | `gui/src/renderer/components/dashboard/AgentCardRow.tsx` | Horizontal scrollable container of AgentCards |
| Create | `gui/src/renderer/components/dashboard/TimelinePeriodPicker.tsx` | Segmented control: Day / Week / Month |
| Create | `gui/src/renderer/components/dashboard/TimelineGrid.tsx` | CSS grid with agent rows × time columns, run bars |
| Create | `gui/src/renderer/components/dashboard/WorkspaceModal.tsx` | Modal for workspace selection (first launch / switch) |
| Create | `gui/src/renderer/pages/DashboardPage.tsx` | Top-level page: data loading, view model assembly, layout |
| Modify | `gui/src/renderer/hooks/use-store.ts` | Change Page type: `'welcome'` → `'dashboard'`, update `clearWorkspace()` |
| Modify | `gui/src/renderer/components/layout/Sidebar.tsx` | Change nav[0]: id `'welcome'` → `'dashboard'`, icon → LayoutDashboard |
| Modify | `gui/src/renderer/App.tsx` | Replace WelcomePage import/render with DashboardPage |
| Modify | `gui/e2e/app.spec.ts` | Update Welcome Page tests → Dashboard Page tests |

---

## Task 1: Agent utility functions

**Files:**
- Create: `gui/src/renderer/lib/agent-utils.ts`
- Create: `gui/src/renderer/lib/agent-utils.test.ts`

- [ ] **Step 1: Create agent-utils.test.ts with tests for all pure functions**

```typescript
// gui/src/renderer/lib/agent-utils.test.ts
import { describe, test, expect } from 'vitest'
import {
  getInitials,
  hashName,
  getGradient,
  getAgentStatus,
  getSuccessRate,
  formatRelativeTime
} from './agent-utils'

describe('getInitials', () => {
  test('two-word name returns two initials', () => {
    expect(getInitials('Code Reviewer')).toBe('CR')
  })
  test('single-word name returns first letter', () => {
    expect(getInitials('Deployer')).toBe('D')
  })
  test('three-word name returns first two initials', () => {
    expect(getInitials('My Deploy Bot')).toBe('MD')
  })
  test('empty string returns empty', () => {
    expect(getInitials('')).toBe('')
  })
})

describe('hashName', () => {
  test('returns consistent number for same input', () => {
    expect(hashName('test')).toBe(hashName('test'))
  })
  test('returns different number for different input', () => {
    expect(hashName('foo')).not.toBe(hashName('bar'))
  })
})

describe('getGradient', () => {
  test('returns a gradient pair from the palette', () => {
    const g = getGradient('Code Reviewer')
    expect(g).toHaveProperty('from')
    expect(g).toHaveProperty('to')
    expect(g.from).toMatch(/^#[0-9a-f]{6}$/i)
  })
  test('same name always returns same gradient', () => {
    expect(getGradient('Deploy Bot')).toEqual(getGradient('Deploy Bot'))
  })
})

describe('getAgentStatus', () => {
  test('running run returns running', () => {
    expect(getAgentStatus([{ status: 'running' }] as any)).toBe('running')
  })
  test('success run returns success', () => {
    expect(getAgentStatus([{ status: 'success' }] as any)).toBe('success')
  })
  test('failure run returns failed', () => {
    expect(getAgentStatus([{ status: 'failure' }] as any)).toBe('failed')
  })
  test('canceled run returns idle', () => {
    expect(getAgentStatus([{ status: 'canceled' }] as any)).toBe('idle')
  })
  test('stale run returns stale', () => {
    expect(getAgentStatus([{ status: 'stale' }] as any)).toBe('stale')
  })
  test('empty runs returns idle', () => {
    expect(getAgentStatus([])).toBe('idle')
  })
})

describe('getSuccessRate', () => {
  test('all success returns 100', () => {
    const runs = [{ status: 'success' }, { status: 'success' }] as any
    expect(getSuccessRate(runs)).toBe(100)
  })
  test('mixed returns correct percentage', () => {
    const runs = [
      { status: 'success' },
      { status: 'failure' },
      { status: 'success' }
    ] as any
    expect(getSuccessRate(runs)).toBe(67)
  })
  test('no runs returns 0', () => {
    expect(getSuccessRate([])).toBe(0)
  })
})

describe('formatRelativeTime', () => {
  test('formats seconds ago', () => {
    const now = new Date()
    const thirtySecsAgo = new Date(now.getTime() - 30000).toISOString()
    expect(formatRelativeTime(thirtySecsAgo)).toBe('just now')
  })
  test('formats minutes ago', () => {
    const now = new Date()
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60000).toISOString()
    expect(formatRelativeTime(fiveMinsAgo)).toBe('5m ago')
  })
  test('formats hours ago', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')
  })
  test('returns empty for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('')
  })
})
```

- [ ] **Step 2: Verify test setup — check if vitest is available, or use a simpler approach**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx vitest --version 2>/dev/null || echo "no vitest"`

If vitest is not available, check package.json for test runner. If no unit test runner exists, these tests will be validated via the e2e tests and manual verification. Keep the test file as documentation of expected behavior.

- [ ] **Step 3: Implement agent-utils.ts**

```typescript
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
```

- [ ] **Step 4: Run tests (if vitest available) or verify TypeScript compiles**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx tsc --noEmit src/renderer/lib/agent-utils.ts 2>&1 || true`

- [ ] **Step 5: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/lib/agent-utils.ts gui/src/renderer/lib/agent-utils.test.ts
git commit -m "feat(dashboard): add agent utility functions for initials, gradients, status, metrics"
```

---

## Task 2: Update store and navigation (welcome → dashboard)

**Files:**
- Modify: `gui/src/renderer/hooks/use-store.ts` (lines 5, 55, 67)
- Modify: `gui/src/renderer/components/layout/Sidebar.tsx` (lines 5-10, icon component)
- Modify: `gui/src/renderer/App.tsx` (lines 3, 11, imports)

- [ ] **Step 1: Update Page type in use-store.ts**

In `gui/src/renderer/hooks/use-store.ts`, change the `Page` type and default value:

```
// Line 5 — change:
type Page = 'welcome' | 'config' | 'history' | 'logs' | 'settings'
// to:
type Page = 'dashboard' | 'config' | 'history' | 'logs' | 'settings'
```

**Important:** Keep `'settings'` in the union — the app has a working Settings page.

```
// Line 55 — change initial page:
page: 'welcome',
// to:
page: 'dashboard',
```

```
// Line 67 — in clearWorkspace, change:
page: 'welcome',
// to:
page: 'dashboard',
```

- [ ] **Step 2: Update Sidebar.tsx navigation**

In `gui/src/renderer/components/layout/Sidebar.tsx`:

Add import at top:
```typescript
import { LayoutDashboard } from 'lucide-react'
```

Change nav array (lines 5-10):
```
// Change:
{ id: 'welcome' as const, label: 'Home', icon: HomeIcon },
// to:
{ id: 'dashboard' as const, label: 'Dashboard', icon: DashboardIcon },
```

Replace the `HomeIcon` SVG component with `DashboardIcon` (match existing icon sizing: 16px, strokeWidth 1.2/1.4):
```typescript
function DashboardIcon({ active }: { active: boolean }) {
  return <LayoutDashboard size={16} strokeWidth={active ? 1.4 : 1.2} />
}
```

- [ ] **Step 3: Create placeholder DashboardPage and update App.tsx**

Create `gui/src/renderer/pages/DashboardPage.tsx`:
```typescript
import { useStore } from '../hooks/use-store'

export function DashboardPage() {
  const workspacePath = useStore((s) => s.workspacePath)

  if (!workspacePath) {
    return (
      <div className="flex h-full items-center justify-center text-[#86868b]">
        <p>Open a workspace to see your agents</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-[#86868b]">
      <p>Dashboard — loading...</p>
    </div>
  )
}
```

In `gui/src/renderer/App.tsx`:

```
// Change import:
import { WelcomePage } from './pages/WelcomePage'
// to:
import { DashboardPage } from './pages/DashboardPage'
```

```
// Change pages object (line ~11):
welcome: WelcomePage,
// to:
dashboard: DashboardPage,
```

- [ ] **Step 4: Verify app builds**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/hooks/use-store.ts gui/src/renderer/components/layout/Sidebar.tsx gui/src/renderer/App.tsx gui/src/renderer/pages/DashboardPage.tsx
git commit -m "feat(dashboard): replace WelcomePage with DashboardPage, update navigation"
```

---

## Task 3: AgentCard component

**Files:**
- Create: `gui/src/renderer/components/dashboard/AgentCard.tsx`

- [ ] **Step 1: Create AgentCard.tsx**

```typescript
// gui/src/renderer/components/dashboard/AgentCard.tsx
import type { AgentViewModel, AgentStatus } from '../../lib/agent-utils'

interface AgentCardProps {
  agent: AgentViewModel
  isEngineRunning: boolean
  runningConfigPath: string | null
  onRun: (configPath: string) => void
  onStop: () => void
  onLogs: (configPath: string) => void
}

const statusConfig: Record<AgentStatus, { color: string; label: string; shadow?: string }> = {
  running: { color: '#30d158', label: 'Running', shadow: '0 0 6px rgba(48,209,88,0.5)' },
  success: { color: '#30d158', label: 'Success' },
  failed: { color: '#ff453a', label: 'Failed' },
  stale: { color: '#86868b', label: 'Stale' },
  idle: { color: '#48484a', label: 'Idle' }
}

export function AgentCard({ agent, isEngineRunning, runningConfigPath, onRun, onStop, onLogs }: AgentCardProps) {
  const st = statusConfig[agent.status]
  const isThisRunning = runningConfigPath === agent.configPath
  const canRun = !isEngineRunning || isThisRunning
  const isFailed = agent.status === 'failed'

  return (
    <div
      className="flex-shrink-0 rounded-2xl p-5"
      style={{
        minWidth: 210,
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${isFailed ? 'rgba(255,69,58,0.2)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {/* Header: avatar + name + status */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center text-white font-semibold"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `linear-gradient(145deg, ${agent.gradient.from}, ${agent.gradient.to})`,
            boxShadow: `0 4px 12px ${agent.gradient.from}4d`,
            fontSize: 16,
          }}
        >
          {agent.initials}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-[#f5f5f7]" style={{ letterSpacing: '-0.2px' }}>
            {agent.name}
          </div>
          <div className="flex items-center gap-[5px] mt-[3px]">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: st.color,
                boxShadow: st.shadow,
                animation: agent.status === 'running' ? 'pulse 2s ease-in-out infinite' : undefined,
              }}
            />
            <span className="text-xs font-medium" style={{ color: st.color }}>
              {st.label}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex justify-between text-xs text-[#86868b] mb-[14px]">
        <span>{agent.lastRunRelative || '—'}</span>
        <span
          className="font-medium"
          style={{ color: agent.successRate >= 80 ? '#30d158' : agent.successRate >= 50 ? '#ff9f0a' : '#ff453a' }}
        >
          {agent.runs.length > 0 ? `${agent.successRate}%` : '—'}
        </span>
      </div>

      {/* Separator */}
      <div className="h-px mb-[14px]" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Actions */}
      <div className="flex gap-2">
        {isThisRunning ? (
          <button
            className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a' }}
            onClick={() => onStop()}
          >
            Stop
          </button>
        ) : (
          <button
            className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium"
            style={{
              background: canRun ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: canRun ? '#0a84ff' : '#48484a',
              cursor: canRun ? 'pointer' : 'not-allowed',
            }}
            onClick={() => canRun && onRun(agent.configPath)}
            disabled={!canRun}
          >
            {agent.status === 'failed' ? '▶ Retry' : '▶ Run'}
          </button>
        )}
        <button
          className="flex-1 text-center py-[7px] rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#86868b' }}
          onClick={() => onLogs(agent.configPath)}
        >
          Logs
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create AgentCardRow.tsx**

```typescript
// gui/src/renderer/components/dashboard/AgentCardRow.tsx
import { AgentCard } from './AgentCard'
import type { AgentViewModel } from '../../lib/agent-utils'

interface AgentCardRowProps {
  agents: AgentViewModel[]
  isEngineRunning: boolean
  runningConfigPath: string | null
  onRun: (configPath: string) => void
  onStop: () => void
  onLogs: (configPath: string) => void
}

export function AgentCardRow({ agents, isEngineRunning, runningConfigPath, onRun, onStop, onLogs }: AgentCardRowProps) {
  return (
    <div className="flex gap-4 overflow-x-auto px-8 py-6" style={{ scrollbarWidth: 'none' }}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.configPath}
          agent={agent}
          isEngineRunning={isEngineRunning}
          runningConfigPath={runningConfigPath}
          onRun={onRun}
          onStop={onStop}
          onLogs={onLogs}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/components/dashboard/AgentCard.tsx gui/src/renderer/components/dashboard/AgentCardRow.tsx
git commit -m "feat(dashboard): add AgentCard and AgentCardRow components"
```

---

## Task 4: TimelinePeriodPicker and TimelineGrid

**Files:**
- Create: `gui/src/renderer/components/dashboard/TimelinePeriodPicker.tsx`
- Create: `gui/src/renderer/components/dashboard/TimelineGrid.tsx`

- [ ] **Step 1: Create TimelinePeriodPicker.tsx**

```typescript
// gui/src/renderer/components/dashboard/TimelinePeriodPicker.tsx
export type Period = 'day' | 'week' | 'month'

interface TimelinePeriodPickerProps {
  value: Period
  onChange: (period: Period) => void
}

const labels: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month' }

export function TimelinePeriodPicker({ value, onChange }: TimelinePeriodPickerProps) {
  return (
    <div
      className="flex rounded-lg p-[2px]"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    >
      {(['day', 'week', 'month'] as Period[]).map((p) => (
        <button
          key={p}
          className="px-4 py-[6px] rounded-md text-[13px] font-medium transition-colors"
          style={{
            background: value === p ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: value === p ? '#f5f5f7' : '#86868b',
          }}
          onClick={() => onChange(p)}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create TimelineGrid.tsx**

```typescript
// gui/src/renderer/components/dashboard/TimelineGrid.tsx
import type { AgentViewModel } from '../../lib/agent-utils'
import type { RunRecord } from '../../types/state'
import type { Period } from './TimelinePeriodPicker'

interface TimelineGridProps {
  agents: AgentViewModel[]
  period: Period
  onBarClick?: (run: RunRecord) => void
}

interface TimeSlot {
  label: string
  start: Date
  end: Date
}

function getTimeSlots(period: Period): TimeSlot[] {
  const now = new Date()
  const slots: TimeSlot[] = []

  if (period === 'day') {
    for (let h = 0; h < 24; h++) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h)
      const end = new Date(start.getTime() + 3600000)
      slots.push({ label: `${h}`, start, end })
    }
  } else if (period === 'week') {
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for (let d = 0; d < 7; d++) {
      const start = new Date(monday.getTime() + d * 86400000)
      const end = new Date(start.getTime() + 86400000)
      slots.push({ label: `${dayNames[d]} ${start.getDate()}`, start, end })
    }
  } else {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 28)
    weekStart.setHours(0, 0, 0, 0)
    // Adjust to Monday
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))

    for (let w = 0; w < 5; w++) {
      const start = new Date(weekStart.getTime() + w * 7 * 86400000)
      const end = new Date(start.getTime() + 7 * 86400000)
      const label = `${start.getDate()}/${start.getMonth() + 1}`
      slots.push({ label, start, end })
    }
  }

  return slots
}

function getRunsInSlot(runs: RunRecord[], slot: TimeSlot): RunRecord[] {
  return runs.filter((r) => {
    const t = new Date(r.started_at)
    return t >= slot.start && t < slot.end
  })
}

const barColors: Record<string, string> = {
  success: '#30d158',
  failure: '#ff453a',
  running: '#0a84ff',
  canceled: '#48484a',
  stale: '#48484a'
}

function isToday(slot: TimeSlot): boolean {
  const now = new Date()
  return slot.start <= now && now < slot.end
}

export function TimelineGrid({ agents, period, onBarClick }: TimelineGridProps) {
  const slots = getTimeSlots(period)
  const colTemplate = `150px repeat(${slots.length}, 1fr)`

  return (
    <div className="px-8 pb-7">
      <div
        className="text-xs font-semibold uppercase mb-[14px]"
        style={{ color: '#86868b', letterSpacing: '0.08em' }}
      >
        Activity
      </div>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Header row */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: colTemplate,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="p-3 px-4" />
          {slots.map((slot, i) => (
            <div
              key={i}
              className="p-3 px-2 text-center text-[11px] font-medium"
              style={{
                color: isToday(slot) ? '#f5f5f7' : '#48484a',
                fontWeight: isToday(slot) ? 600 : 500,
              }}
            >
              {slot.label}
            </div>
          ))}
        </div>

        {/* Agent rows */}
        {agents.map((agent, ai) => (
          <div
            key={agent.configPath}
            className="grid items-center"
            style={{
              gridTemplateColumns: colTemplate,
              borderBottom: ai < agents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
            }}
          >
            {/* Agent label */}
            <div className="flex items-center gap-[10px] py-[14px] px-4">
              <div
                className="flex items-center justify-center text-white font-semibold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: `linear-gradient(145deg, ${agent.gradient.from}, ${agent.gradient.to})`,
                  fontSize: 11,
                }}
              >
                {agent.initials}
              </div>
              <span className="text-[13px] font-medium text-[#f5f5f7]">{agent.name}</span>
            </div>

            {/* Time cells */}
            {slots.map((slot, si) => {
              const slotRuns = getRunsInSlot(agent.runs, slot)
              return (
                <div key={si} className="flex gap-[3px] justify-center py-2 px-[6px]">
                  {slotRuns.map((run, ri) => (
                    <div
                      key={ri}
                      style={{
                        width: 6,
                        height: 22,
                        borderRadius: 3,
                        background: barColors[run.status] ?? '#48484a',
                        opacity: 0.9,
                        cursor: onBarClick ? 'pointer' : undefined,
                        animation: run.status === 'running' ? 'pulse 2s ease-in-out infinite' : undefined,
                      }}
                      onClick={() => onBarClick?.(run)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}

        {/* Empty state */}
        {agents.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-[#48484a]">
            No activity yet
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/components/dashboard/TimelinePeriodPicker.tsx gui/src/renderer/components/dashboard/TimelineGrid.tsx
git commit -m "feat(dashboard): add TimelinePeriodPicker and TimelineGrid components"
```

---

## Task 5: WorkspaceModal

**Files:**
- Create: `gui/src/renderer/components/dashboard/WorkspaceModal.tsx`

- [ ] **Step 1: Create WorkspaceModal.tsx**

Reference existing WelcomePage pattern (`gui/src/renderer/pages/WelcomePage.tsx` lines 6-35) for workspace loading logic.

```typescript
// gui/src/renderer/components/dashboard/WorkspaceModal.tsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FolderOpen, Clock } from 'lucide-react'
import { useStore } from '../../hooks/use-store'

interface WorkspaceModalProps {
  open: boolean
}

export function WorkspaceModal({ open }: WorkspaceModalProps) {
  const [recent, setRecent] = useState<string[]>([])
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setPage = useStore((s) => s.setPage)

  useEffect(() => {
    if (open) {
      window.electronAPI.getRecentWorkspaces().then((list) => {
        setRecent(list)
        // Auto-open most recent if available
        if (list.length > 0) {
          openWorkspace(list[0])
        }
      })
    }
  }, [open])

  async function openWorkspace(path?: string) {
    const dir = path ?? (await window.electronAPI.openWorkspace())
    if (!dir) return
    const configs = await window.electronAPI.getWorkspaceConfigs(dir)
    setWorkspace(dir, configs)
    setPage('dashboard')
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-8 w-[400px]"
          style={{
            background: 'rgba(28,28,30,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(40px)',
          }}
        >
          <h2 className="text-xl font-semibold text-[#f5f5f7] mb-1" style={{ letterSpacing: '-0.3px' }}>
            Agent Orchestra
          </h2>
          <p className="text-[13px] text-[#86868b] mb-6">
            Open a workspace to manage your agents
          </p>

          <button
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium cursor-pointer mb-6"
            style={{ background: 'rgba(10,132,255,0.15)', color: '#0a84ff' }}
            onClick={() => openWorkspace()}
          >
            <FolderOpen size={16} />
            Open Workspace
          </button>

          {recent.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={12} className="text-[#48484a]" />
                <span className="text-[11px] uppercase font-semibold text-[#48484a]" style={{ letterSpacing: '0.08em' }}>
                  Recent
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {recent.map((path) => (
                  <button
                    key={path}
                    className="text-left px-3 py-2 rounded-lg text-[13px] text-[#86868b] hover:text-[#f5f5f7] transition-colors cursor-pointer truncate"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                    onClick={() => openWorkspace(path)}
                  >
                    {path.split('/').pop()}
                    <span className="block text-[11px] text-[#48484a] truncate">{path}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/components/dashboard/WorkspaceModal.tsx
git commit -m "feat(dashboard): add WorkspaceModal for workspace selection"
```

---

## Task 6: Assemble DashboardPage

**Files:**
- Modify: `gui/src/renderer/pages/DashboardPage.tsx` (replace placeholder from Task 2)

- [ ] **Step 1: Implement full DashboardPage**

```typescript
// gui/src/renderer/pages/DashboardPage.tsx
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../hooks/use-store'
import { AgentCardRow } from '../components/dashboard/AgentCardRow'
import { TimelinePeriodPicker, type Period } from '../components/dashboard/TimelinePeriodPicker'
import { TimelineGrid } from '../components/dashboard/TimelineGrid'
import { WorkspaceModal } from '../components/dashboard/WorkspaceModal'
import { buildAgentViewModel, type AgentViewModel } from '../lib/agent-utils'
import type { Config } from '../types/config'
import type { RunRecord } from '../types/state'

export function DashboardPage() {
  const workspacePath = useStore((s) => s.workspacePath)
  const workspaceConfigs = useStore((s) => s.workspaceConfigs)
  const processStatus = useStore((s) => s.processStatus)
  const setPage = useStore((s) => s.setPage)
  const setConfig = useStore((s) => s.setConfig)
  const setSelectedRun = useStore((s) => s.setSelectedRun)
  const setRunHistory = useStore((s) => s.setRunHistory)

  const [agents, setAgents] = useState<AgentViewModel[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [runningConfigPath, setRunningConfigPath] = useState<string | null>(null)

  const isEngineRunning = processStatus === 'running'

  // Load agent data
  const loadAgents = useCallback(async () => {
    if (!workspacePath) return

    const history: RunRecord[] = await window.electronAPI.getWorkspaceHistory(workspacePath)
    setRunHistory(history)

    const agentViewModels: AgentViewModel[] = []
    for (const configPath of workspaceConfigs) {
      try {
        const config: Config = await window.electronAPI.loadConfigFile(configPath)
        const name = config.pipeline?.name ?? config.orchestrator?.name ?? configPath.split('/').pop()?.replace(/\.ya?ml$/, '') ?? 'Unknown'
        agentViewModels.push(buildAgentViewModel(configPath, name, history))
      } catch {
        // Skip invalid configs
      }
    }

    setAgents(agentViewModels)
  }, [workspacePath, workspaceConfigs, setRunHistory])

  // Initial load
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Periodic refresh (30s safety net)
  useEffect(() => {
    if (!workspacePath) return
    const interval = setInterval(loadAgents, 30000)
    return () => clearInterval(interval)
  }, [workspacePath, loadAgents])

  // Subscribe to engine events for live updates
  useEffect(() => {
    const unsubStatus = window.electronAPI.onProcessStatusChange((status) => {
      useStore.getState().setProcessStatus(status)
      if (status === 'stopped') {
        setRunningConfigPath(null)
        loadAgents() // Refresh on completion
      }
    })

    return () => {
      unsubStatus()
    }
  }, [loadAgents])

  // Actions — once=true for dashboard Run (single execution, not looping)
  async function handleRun(configPath: string) {
    setRunningConfigPath(configPath)
    await window.electronAPI.startProcess(configPath, true)
  }

  async function handleStop() {
    await window.electronAPI.stopProcess()
    setRunningConfigPath(null)
  }

  function handleLogs(configPath: string) {
    setPage('logs')
  }

  function handleTimelineBarClick(run: RunRecord) {
    setSelectedRun(run)
    setPage('history')
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#000000' }}>
      <WorkspaceModal open={!workspacePath} />

      {workspacePath && (
        <>
          {/* Header */}
          <div className="flex items-baseline justify-between pt-7 px-8">
            <div>
              <div className="text-[28px] font-bold text-[#f5f5f7]" style={{ letterSpacing: '-0.5px' }}>
                My Agents
              </div>
              <div className="text-[13px] text-[#86868b] mt-1">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
                {agents.filter((a) => a.status === 'running').length > 0 &&
                  ` · ${agents.filter((a) => a.status === 'running').length} active`}
              </div>
            </div>
            <TimelinePeriodPicker value={period} onChange={setPeriod} />
          </div>

          {/* Agent Cards */}
          {agents.length > 0 ? (
            <AgentCardRow
              agents={agents}
              isEngineRunning={isEngineRunning}
              runningConfigPath={runningConfigPath}
              onRun={handleRun}
              onStop={handleStop}
              onLogs={handleLogs}
            />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-[#48484a]">
              No agents in this workspace
            </div>
          )}

          {/* Timeline */}
          <TimelineGrid agents={agents} period={period} onBarClick={handleTimelineBarClick} />
        </>
      )}

      {/* Pulse animation for running indicators */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Verify app builds**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npm run build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/src/renderer/pages/DashboardPage.tsx
git commit -m "feat(dashboard): assemble full DashboardPage with data loading and interactions"
```

---

## Task 7: Update E2E tests

**Files:**
- Modify: `gui/e2e/app.spec.ts`

- [ ] **Step 1: Update test references from Welcome to Dashboard**

In `gui/e2e/app.spec.ts`, make these changes:

```
// Line 27 — change describe name:
test.describe('Welcome Page', () => {
// to:
test.describe('Dashboard Page', () => {
```

```
// Line 28-31 — update title test:
test('shows app title', async () => {
    const title = page.locator('text=Agent Orchestra')
    await expect(title.first()).toBeVisible()
  })
// to:
test('shows dashboard when no workspace', async () => {
    const text = page.locator('text=Agent Orchestra')
    await expect(text.first()).toBeVisible()
  })
```

```
// Line 33-36 — update button test:
test('shows Open Workspace button', async () => {
    const btn = page.locator('text=Open Workspace')
    await expect(btn).toBeVisible()
  })
// Keep this test as-is — WorkspaceModal still shows "Open Workspace"
```

```
// Line 67 — in navigation test, change expected text:
await expect(page.locator('text=Open Workspace')).toBeVisible()
// Keep as-is — clicking dashboard nav shows WorkspaceModal with "Open Workspace"
```

- [ ] **Step 2: Verify tests still compile**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npx tsc -p e2e/tsconfig.json --noEmit 2>&1 || true`

- [ ] **Step 3: Commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add gui/e2e/app.spec.ts
git commit -m "test(dashboard): update e2e tests for Dashboard replacing Welcome page"
```

---

## Task 8: Visual QA and cleanup

- [ ] **Step 1: Build and launch the app**

Run: `cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra/gui && npm run build && npm run dev`

- [ ] **Step 2: Visual verification checklist**

Manually verify in the running app:
- [ ] App opens with WorkspaceModal (or auto-opens recent workspace)
- [ ] Dashboard shows after workspace selection
- [ ] Agent cards render with correct initials and gradients
- [ ] Status indicators display correctly
- [ ] Period picker switches between Day/Week/Month
- [ ] Timeline grid updates when period changes
- [ ] Run/Stop buttons work (Start changes to Stop when running)
- [ ] Logs button navigates to Logs page
- [ ] Sidebar shows Dashboard icon (LayoutDashboard) instead of Home
- [ ] Sidebar active indicator works on Dashboard
- [ ] Page transitions are smooth

- [ ] **Step 3: Fix any issues found during visual QA**

- [ ] **Step 4: Final commit**

```bash
cd /Users/pavelpantiukhov/Projects/factory/agent-orchestra
git add -A
git commit -m "feat(dashboard): visual polish and fixes"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Agent utility functions (pure logic) | `lib/agent-utils.ts`, `lib/agent-utils.test.ts` |
| 2 | Store + navigation migration | `use-store.ts`, `Sidebar.tsx`, `App.tsx`, placeholder `DashboardPage.tsx` |
| 3 | AgentCard + AgentCardRow components | `dashboard/AgentCard.tsx`, `dashboard/AgentCardRow.tsx` |
| 4 | Timeline components | `dashboard/TimelinePeriodPicker.tsx`, `dashboard/TimelineGrid.tsx` |
| 5 | WorkspaceModal | `dashboard/WorkspaceModal.tsx` |
| 6 | Assemble DashboardPage | `DashboardPage.tsx` (full implementation) |
| 7 | Update E2E tests | `e2e/app.spec.ts` |
| 8 | Visual QA and cleanup | Any fixes needed |
