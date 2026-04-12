import { useEffect, useState } from 'react'
import { RefreshCw, Terminal, Copy, Check, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useStore } from '../hooks/use-store'
import { cn } from '../lib/utils'
import type { RunRecord } from '../types/state'

const statusColors: Record<string, string> = {
  running: 'bg-foreground/[0.08] text-foreground',
  success: 'bg-foreground/[0.06] text-muted-foreground',
  failure: 'bg-destructive/10 text-destructive',
  canceled: 'bg-foreground/[0.06] text-muted-foreground',
  stale: 'bg-foreground/[0.04] text-muted-foreground/60'
}

const ALL_STATUSES = ['all', 'success', 'failure', 'running', 'canceled', 'stale'] as const

export function HistoryPage() {
  const { workspacePath, runHistory, selectedRun, setRunHistory, setSelectedRun, setConfig, setPage } = useStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const loadHistory = async () => {
    if (!workspacePath) return
    const history = await window.electronAPI.getWorkspaceHistory(workspacePath)
    setRunHistory(history)
  }

  useEffect(() => { loadHistory() }, [workspacePath])

  if (!workspacePath) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground text-[13px]">Open a workspace first</div>
  }

  const filtered = statusFilter === 'all' ? runHistory : runHistory.filter((r) => r.status === statusFilter)
  const statusCounts = runHistory.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {} as Record<string, number>)

  const handleRerun = async (run: RunRecord) => {
    if (!run.config) return
    try {
      const content = await window.electronAPI.loadConfigFile(run.config)
      setConfig(run.config, content)
      setPage('config')
    } catch {}
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Run list */}
      <div className="w-80 border-r border-border/40 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
          <span className="ao-heading">Runs ({filtered.length})</span>
          <button className="ao-btn-icon" onClick={loadHistory}><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              className={cn('px-2 py-0.5 text-[11px] rounded-md transition-colors duration-100',
                statusFilter === s ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'
              )}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? `All (${runHistory.length})` : `${s} (${statusCounts[s] || 0})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 p-2">{runHistory.length === 0 ? 'No runs yet' : 'No runs match filter'}</p>
            ) : filtered.map((run) => (
              <div
                key={run.id}
                className={cn('rounded-md px-3.5 py-2.5 cursor-pointer hover:bg-foreground/[0.04] active:scale-[0.98] active:opacity-80 transition-all duration-100',
                  selectedRun?.id === run.id && 'bg-foreground/[0.06]'
                )}
                onClick={() => setSelectedRun(run)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] truncate text-foreground/80">{run.pipeline}</span>
                  <span className={`ao-badge ${statusColors[run.status] || statusColors.stale}`}>{run.status}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">
                  {new Date(run.started_at).toLocaleString()}{run.duration && ` — ${run.duration}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Run detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRun ? (
          <RunDetail run={selectedRun} onRerun={handleRerun} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/60 text-[13px]">Select a run to view details</div>
        )}
      </div>
    </div>
  )
}

// ── Parse Claude JSON output ──────────────────────────────────

interface ParsedResult {
  result: string
  sessionId: string
  cost: number
  durationMs: number
  numTurns: number
  stopReason: string
  isError: boolean
  raw: string
}

function parseClaudeOutput(output?: string): ParsedResult | null {
  if (!output) return null
  // Find the JSON result line
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.type === 'result') {
        return {
          result: parsed.result || '',
          sessionId: parsed.session_id || '',
          cost: parsed.total_cost_usd || 0,
          durationMs: parsed.duration_ms || 0,
          numTurns: parsed.num_turns || 0,
          stopReason: parsed.stop_reason || '',
          isError: parsed.is_error || false,
          raw: trimmed
        }
      }
    } catch {}
  }
  return null
}

// ── Run Detail ──────────────────────────────────────────────────

function RunDetail({ run, onRerun }: { run: RunRecord; onRerun: (run: RunRecord) => void }) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="ao-heading">{run.pipeline}</h2>
          <div className="flex items-center gap-2">
            <button className="ao-btn-secondary" onClick={() => onRerun(run)}>
              <Play className="h-3 w-3" /> Re-run
            </button>
            <span className={`ao-badge ${statusColors[run.status] || statusColors.stale}`}>{run.status}</span>
          </div>
        </div>

        {/* Info */}
        <div className="ao-card">
          <div className="px-4 py-3 text-[13px] space-y-1.5">
            <Row label="Started" value={new Date(run.started_at).toLocaleString()} />
            {run.ended_at && <Row label="Ended" value={new Date(run.ended_at).toLocaleString()} />}
            {run.duration && <Row label="Duration" value={run.duration} />}
            {run.ssh && <Row label="Host" value={`${run.ssh.user}@${run.ssh.host}`} />}
            {run.error && (
              <div><span className="text-muted-foreground/60">Error: </span><span className="text-destructive text-[12px]">{run.error}</span></div>
            )}
          </div>
        </div>

        {/* tmux */}
        {run.tmux && <TmuxCard tmux={run.tmux} />}

        {/* Steps */}
        {run.steps.filter(s => s.name !== '_init').map((step, i) => (
          <StepCard key={i} step={step} ssh={run.ssh} />
        ))}
      </div>
    </div>
  )
}

// ── Step Card ──────────────────────────────────────────────────

function StepCard({ step, ssh }: { step: RunRecord['steps'][0]; ssh?: RunRecord['ssh'] }) {
  const [showRaw, setShowRaw] = useState(false)
  const parsed = parseClaudeOutput(step.output)

  return (
    <div className="ao-card">
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-foreground/80">{step.name}</span>
          <div className="flex items-center gap-2">
            {step.duration && <span className="text-[11px] text-muted-foreground/50">{step.duration}</span>}
            <span className={`ao-badge ${step.status === 'success' ? 'bg-foreground/[0.06] text-muted-foreground' : 'bg-destructive/10 text-destructive'}`}>
              {step.status}
            </span>
          </div>
        </div>

        {step.error && <div className="text-[12px] text-destructive mt-2">{step.error}</div>}

        {/* Parsed result */}
        {parsed && (
          <div className="mt-3 space-y-3">
            {/* Result text */}
            {parsed.result && (
              <div className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {parsed.result}
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground/50">
              {parsed.numTurns > 0 && <span>{parsed.numTurns} turn{parsed.numTurns > 1 ? 's' : ''}</span>}
              {parsed.durationMs > 0 && <span>{(parsed.durationMs / 1000).toFixed(1)}s</span>}
              {parsed.cost > 0 && <span>${parsed.cost.toFixed(4)}</span>}
              {parsed.stopReason && <span>{parsed.stopReason}</span>}
            </div>

            {/* Session */}
            {parsed.sessionId && <SessionInfo sessionId={parsed.sessionId} ssh={ssh} />}

            {/* Raw toggle */}
            <button
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors inline-flex items-center gap-1"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Raw JSON
            </button>

            <AnimatePresence>
              {showRaw && (
                <motion.pre
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="bg-[hsl(var(--terminal-bg))] text-[hsl(var(--terminal-fg))] p-3 rounded-md text-[11px] overflow-auto max-h-48"
                >
                  {JSON.stringify(JSON.parse(parsed.raw), null, 2)}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Non-JSON output fallback */}
        {!parsed && step.output && (
          <pre className="bg-[hsl(var(--terminal-bg))] text-[hsl(var(--terminal-fg))] p-3 rounded-md text-[11px] overflow-auto max-h-40 mt-3">
            {step.output}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── Session Info ──────────────────────────────────────────────

function SessionInfo({ sessionId, ssh }: { sessionId: string; ssh?: RunRecord['ssh'] }) {
  const [copied, setCopied] = useState(false)
  const claudeCmd = `claude --resume ${sessionId}`
  const resumeCmd = ssh
    ? `ssh ${ssh.user}@${ssh.host}${ssh.port && ssh.port !== 22 ? ` -p ${ssh.port}` : ''} -t '${claudeCmd}'`
    : claudeCmd

  const handleCopy = () => {
    navigator.clipboard.writeText(resumeCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-md bg-foreground/[0.03]">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground/50">Resume session</div>
        <code className="text-[12px] text-foreground/70 font-mono break-all">{resumeCmd}</code>
      </div>
      <button className="ao-btn-icon shrink-0" onClick={handleCopy}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ── tmux Card ──────────────────────────────────────────────────

function TmuxCard({ tmux }: { tmux: NonNullable<RunRecord['tmux']> }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="ao-card">
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="ao-heading">tmux Session</span>
      </div>
      <div className="px-4 py-3 text-[13px] space-y-2">
        <Row label="Session" value={tmux.session} />
        <Row label="TTL" value={tmux.ttl} />
        <div className="flex items-center gap-2">
          <code className="bg-foreground/[0.04] px-2 py-1 rounded-md text-[11px] flex-1 truncate font-mono">{tmux.attach}</code>
          <button
            className="ao-btn-icon shrink-0"
            onClick={() => { navigator.clipboard.writeText(tmux.attach); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground/50 text-[12px] w-16 shrink-0">{label}</span>
      <span className="text-[13px] text-foreground/70">{value}</span>
    </div>
  )
}
