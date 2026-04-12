# Dashboard "Мои агенты" — Design Spec

## Overview

Replace the WelcomePage with a DashboardPage that shows all pipeline agents as "subordinates" — their status, success rate, run history, and a visual timeline of activity. The dashboard becomes the main page of the application.

## Problem

Currently, after selecting a workspace, the user lands on a Welcome page with no operational value. To see agent status and history, they must navigate to History or Logs pages individually. There's no single view that answers: "What are my agents doing right now, and how have they been performing?"

## Solution

A new DashboardPage with two sections:
1. **Agent cards** — horizontal scrollable row of frosted-glass cards, one per pipeline config
2. **Activity timeline** — grid showing run history per agent across time (day/week/month)

Quick actions (Run, Stop, Logs) are available directly from agent cards.

## Design Language

Apple-style dark UI:
- Background: #000000
- Cards: `rgba(255,255,255,0.06)` with `backdrop-filter: blur(40px)`, border `rgba(255,255,255,0.08)`, border-radius 16px
- System colors: green #30d158, red #ff453a, blue #0a84ff, secondary text #86868b
- Typography: SF Pro / system-ui, -0.5px letter-spacing on headings
- Buttons: tinted translucent backgrounds (e.g. `rgba(10,132,255,0.15)`)
- Separators: `rgba(255,255,255,0.06)`
- Generous padding throughout

## Data Model

### Agent identity

Each pipeline config in the workspace = one agent.

| Field | Source |
|-------|--------|
| Name | `pipeline.name` from YAML, fallback to filename without extension |
| Initials | First letter of each word in name, max 2 characters (e.g. "Code Reviewer" → "CR") |
| Avatar gradient | Deterministic from name hash — pick from palette of 8 Apple-style gradient pairs |
| Config path | Absolute path to the YAML file |

### Gradient palette (8 pairs)

```
0: #5e5ce6 → #bf5af2  (indigo-purple)
1: #ff9f0a → #ff6723  (orange)
2: #ff375f → #ff2d55  (pink-red)
3: #64d2ff → #5ac8fa  (cyan)
4: #30d158 → #34c759  (green)
5: #ff6482 → #ffd60a  (coral-yellow)
6: #0a84ff → #5e5ce6  (blue-indigo)
7: #ac8e68 → #d4a574  (warm neutral)
```

Selection: `hash(name) % 8`

### Agent status

Derived from the most recent RunRecord for that config:

| Status | Condition | Indicator |
|--------|-----------|-----------|
| Running | Latest run has `status: 'running'` | Pulsing green dot |
| Success | Latest run has `status: 'success'` | Solid green dot |
| Failed | Latest run has `status: 'failure'` | Red dot, red card border |
| Canceled | Latest run has `status: 'canceled'` | Gray dot, same as Idle |
| Stale | Latest run has `status: 'stale'` | Gray dot with warning icon |
| Idle | No runs exist | Gray dot |

### Agent metrics

| Metric | Computation |
|--------|-------------|
| Success rate | `successCount / totalCount` from RunRecords within the selected time period, displayed as percentage |
| Last run | `ended_at` of most recent RunRecord, displayed as relative time ("2 мин назад") |
| Next run | Only for orchestrator configs with triggers: `last_run + poll_interval`. For pipelines without triggers: not shown |

### Timeline data

RunRecords grouped by:
- Agent (config path)
- Time bucket (hour for day view, day for week view, week for month view)

Each run rendered as a small vertical bar:
- Green (#30d158): success
- Red (#ff453a): failure
- Blue pulsing (#0a84ff): running

## Components

### DashboardPage

Top-level page component. Replaces WelcomePage in the navigation.

**Responsibilities:**
- Load workspace config paths via `getWorkspaceConfigs(workspacePath)` IPC (returns `string[]` of YAML file paths)
- Load each config's content via `loadConfigFile(path)` IPC to extract `pipeline.name`, trigger info, etc.
- Load run history via `getWorkspaceHistory(workspacePath)` IPC (returns `RunRecord[]`)
- Compute agent statuses and metrics from run history
- Subscribe to engine events for live updates (primary mechanism for real-time status)
- Periodic refresh every 30 seconds via `getWorkspaceHistory()` as a safety net
- On receiving `pipeline:completed` / `pipeline:failed` / `pipeline:canceled` events, immediately refresh history
- Show WorkspaceModal if no workspace selected (auto-open most recent workspace, same behavior as current WelcomePage)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Header: "Мои агенты" (count)    [Д|Н|М]    │
├─────────────────────────────────────────────┤
│ ┌──────┐ ┌──────��� ┌──────┐ ┌──────┐  →     │
│ │ Card │ │ Card │ │ Card │ │ Card │  scroll │
│ └──────┘ └──────┘ └──────┘ └──────┘         │
├─────────────────────────────────────────────┤
│ АКТИВНОСТЬ                                  │
│ ┌───────┬───┬───┬───┬───┬───┬───┬───┐      │
│ │       │Пн │Вт │Ср │Чт │Пт │Сб │Вс │      │
│ ├───────┼───┼───┼───┼───┼───┼───┼───┤      │
│ │ CR    │▮▮ │▮  │▮▮▮│▮  │▮▮ │▮  │   │      │
│ │ DB    │▮  │   │▮  │▮▮ │▮  │   │   │      │
│ │ TR    │▮▮ │▮▯ │▮  │▮  │▯  │   │   │      │
│ └───────┴───┴───┴───┴───┴───┴───┴───┘      │
└─────────────────────────────────────────────┘
```

### AgentCard

Frosted glass card for a single agent.

**Props:** `agent: AgentViewModel`

**Structure:**
- Avatar (initials on gradient, 44x44, border-radius 12px, colored box-shadow)
- Name (15px, font-weight 600)
- Status indicator (6px dot + label)
- Separator line
- Metrics row: last run time (left), success rate % (right)
- Action buttons: Run/Stop + Logs

**Buttons:**
- If running → "Стоп" (red tint) + "Логи"
- If idle/success → "▶ Запуск" (blue tint) + "Логи"
- If failed → "▶ Повтор" (blue tint) + "Логи"

### AgentCardRow

Horizontal scrollable container for AgentCards.

`display: flex; gap: 16px; overflow-x: auto; padding: 24px 32px;`

### TimelinePeriodPicker

Segmented control: День / Неделя / Месяц.

Apple-style pill: `background: rgba(255,255,255,0.08); border-radius: 8px; padding: 2px;`
Active segment: `background: rgba(255,255,255,0.12); border-radius: 6px;`

### TimelineGrid

CSS grid table with agent rows and time columns.

**Week view columns:** 150px (agent label) + 7 × 1fr (days)
**Day view columns:** 150px + 24 × 1fr (hours)
**Month view columns:** 150px + 4-5 × 1fr (weeks)

Row height: ~48px. Agent label includes mini avatar (22px) + name.

Run bars: 6px wide, 22px tall, border-radius 3px, 3px gap between bars in same cell.

### WorkspaceModal

Modal overlay shown when `workspacePath` is null.

- "Open Workspace" button → system folder picker via `openWorkspace()` IPC
- Recent workspaces list (from Electron userData, same data as current WelcomePage)
- Selecting a recent workspace closes modal and loads configs

## Navigation Changes

### Zustand store

```typescript
// Current page type
type Page = 'welcome' | 'config' | 'history' | 'logs'

// New page type
type Page = 'dashboard' | 'config' | 'history' | 'logs'
```

### Sidebar

- Replace Home icon (`Home`) with Dashboard icon (`LayoutDashboard` from lucide-react)
- Route to `'dashboard'` instead of `'welcome'`

### App.tsx

- Replace `<WelcomePage />` rendering with `<DashboardPage />`
- Match on `page === 'dashboard'` instead of `page === 'welcome'`

## Constraints

### Single-agent execution

The engine supports only one running pipeline at a time. Calling `startEngine(configPath)` aborts any currently running pipeline. `stopEngine()` is global — it stops whatever is running, not a specific agent.

**UX implications:**
- When one agent is running, "Запуск" buttons on all other agent cards are **disabled** (grayed out)
- Only the running agent's card shows the "Стоп" button
- If user clicks "Запуск" while another agent is running, show a confirmation: "Agent X is currently running. Stop it and start Y?"
- The dashboard tracks which config was last started via `startEngine()`, and attributes all engine events to that agent

### Event-to-agent correlation

Engine events do not carry a config path. The dashboard maintains a `runningConfigPath: string | null` in local state. When `startEngine(path)` is called, set `runningConfigPath = path`. All incoming engine events are attributed to this agent. On `pipeline:completed` / `pipeline:failed` / `pipeline:canceled`, clear `runningConfigPath`.

## Interactions

| Action | Behavior |
|--------|----------|
| Click "Запуск" / "Повтор" | If no agent running: call `startEngine(agent.configPath)` via IPC, set `runningConfigPath`. If another agent running: show confirmation dialog first. |
| Click "Стоп" | Call `stopEngine()` via IPC. Card status updates when `pipeline:canceled` event received. Clear `runningConfigPath`. |
| Click "Логи" | Set `page: 'logs'` in store. Pre-select log file by matching pipeline name or config directory in the log file list. |
| Click timeline bar | Set `selectedRun` to the corresponding RunRecord in store, then set `page: 'history'`. |
| Switch period (Д/Н/М) | Re-bucket timeline data client-side, re-render TimelineGrid. |

## Data Flow

```
IPC: getWorkspaceConfigs(path)  ──→ string[] (YAML file paths)
IPC: loadConfigFile(path)       ──→ parsed Config object (per file)
IPC: getWorkspaceHistory(path)  ──→ RunRecord[] (all runs)
Engine events (on)              ──→ live status updates

        ┌─────────────┐
        │ DashboardPage��
        │  (assembles  │
        │   view models)│
        └──────┬───────┘
               │
     ┌─────────��──────────┐
     ▼         ▼          ▼
AgentCardRow  TimePicker  TimelineGrid
     │                        │
     ▼                        ▼
  AgentCard              run bar cells
```

No new IPC channels needed. All data comes from existing:
- `workspace:configs` → list of YAML file paths
- `config:load` → parsed config per file
- `workspace:history` → run records
- `engine:event` → live events

## Edge Cases

### Empty state (no agents)
When the workspace has zero YAML config files (or none with a `pipeline` key), show a centered message: "No agents in this workspace" with a button to open the Config page or switch workspace.

### Many agents (20+)
V1 targets workspaces with up to ~20 agents. The horizontal card row scrolls naturally. The timeline grid scrolls vertically within available space. No pagination or filtering in v1.

### Store migration
`clearWorkspace()` in the Zustand store currently resets `page` to `'welcome'` — must be updated to `'dashboard'`.

## UI Language

The app currently uses English throughout. Dashboard labels will also be in English: "My Agents", "Activity", "Day/Week/Month", "Run/Stop/Logs". The mockups used Russian for illustration only.

## What We're NOT Doing

- No new IPC channels or main-process changes
- No changes to the engine or pipeline execution logic
- No concurrent agent execution — single-agent engine constraint remains
- No persistent scheduling system — "next run" is display-only, computed from trigger poll_interval
- No drag-and-drop or inline config editing on the dashboard
- No new data persistence — all derived from existing configs and run history
