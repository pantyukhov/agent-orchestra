import { useEffect, useState } from 'react'
import { RefreshCw, Terminal, Copy, Check, Play } from 'lucide-react'
import { useStore } from '../hooks/use-store'
import { cn } from '../lib/utils'
import type { RunRecord } from '../types/state'

const statusColors: Record<string, string> = {
  running: 'bg-foreground/[0.08] text-foreground',
  success: 'bg-foreground/[0.06] text-muted-foreground',
  failure: 'bg-destructive/10 text-destructive',
  canceled: 'bg-foreground/[0.06] text-muted-foreground'
}

const ALL_STATUSES = ['all', 'success', 'failure', 'running', 'canceled'] as const

export function HistoryPage() {
  const { workspacePath, runHistory, selectedRun, setRunHistory, setSelectedRun, setConfig, setPage } = useStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const loadHistory = async () => {
    if (!workspacePath) return
    const history = await window.electronAPI.getWorkspaceHistory(workspacePath)
    setRunHistory(history)
  }

  useEffect(() => {
    loadHistory()
  }, [workspacePath])

  if (!workspacePath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-[13px]">
        Open a workspace first
      </div>
    )
  }

  const filtered = statusFilter === 'all'
    ? runHistory
    : runHistory.filter((r) => r.status === statusFilter)

  const statusCounts = runHistory.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )

  const handleRerun = async (run: RunRecord) => {
    if (!run.config) return
    try {
      const content = await window.electronAPI.loadConfigFile(run.config)
      setConfig(run.config, content)
      setPage('execution')
    } catch {
      // config might not exist anymore
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Run list */}
      <div className="w-80 border-r border-border/40 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
          <span className="text-[13px] font-medium text-foreground/80">Runs ({filtered.length})</span>
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100"
            onClick={loadHistory}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-md transition-colors duration-100',
                statusFilter === s
                  ? 'bg-foreground/[0.08] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'
              )}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? `All (${runHistory.length})` : `${s} (${statusCounts[s] || 0})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-1">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 p-2">
                {runHistory.length === 0 ? 'No runs yet' : 'No runs match filter'}
              </p>
            ) : (
              filtered.map((run) => (
                <div
                  key={run.id}
                  className={cn(
                    'rounded-md px-3 py-2 cursor-pointer hover:bg-foreground/[0.04] transition-colors duration-100',
                    selectedRun?.id === run.id && 'bg-foreground/[0.06]'
                  )}
                  onClick={() => setSelectedRun(run)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium truncate text-foreground/80">{run.pipeline}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-md ${statusColors[run.status] || statusColors.canceled}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-1">
                    {new Date(run.started_at).toLocaleString()}
                    {run.duration && ` \u2014 ${run.duration}`}
                  </div>
                  {run.tmux && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 mt-1">
                      <Terminal className="h-3 w-3" />
                      <span className="truncate">{run.tmux.session}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Run detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRun ? (
          <RunDetail run={selectedRun} onRerun={handleRerun} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/60 text-[13px]">
            Select a run to view details
          </div>
        )}
      </div>
    </div>
  )
}

function RunDetail({ run, onRerun }: { run: RunRecord; onRerun: (run: RunRecord) => void }) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-foreground/80">{run.pipeline}</h2>
          <div className="flex items-center gap-2">
            <button
              className="px-2.5 py-1 text-[12px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1"
              onClick={() => onRerun(run)}
            >
              <Play className="h-3 w-3" /> Re-run
            </button>
            <span className={`px-1.5 py-0.5 text-[11px] rounded-md ${statusColors[run.status] || statusColors.canceled}`}>
              {run.status}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-border/40">
          <div className="px-4 py-3 text-[13px] space-y-2">
            <Row label="ID" value={run.id} />
            <Row label="Config" value={run.config} />
            <Row label="Started" value={new Date(run.started_at).toLocaleString()} />
            {run.ended_at && <Row label="Ended" value={new Date(run.ended_at).toLocaleString()} />}
            {run.duration && <Row label="Duration" value={run.duration} />}
            {run.error && (
              <div>
                <span className="text-muted-foreground/80">Error: </span>
                <span className="text-destructive">{run.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* tmux */}
        {run.tmux && <TmuxCard tmux={run.tmux} />}

        {/* SSH only */}
        {run.ssh && !run.tmux && (
          <div className="rounded-lg border border-border/40">
            <div className="px-4 py-3 text-[13px] space-y-2">
              <Row label="SSH Host" value={`${run.ssh.user}@${run.ssh.host}`} />
              {run.ssh.port > 0 && <Row label="Port" value={String(run.ssh.port)} />}
            </div>
          </div>
        )}

        {/* Steps */}
        {run.steps.length > 0 && (
          <div className="rounded-lg border border-border/40">
            <div className="px-4 py-2.5 border-b border-border/40">
              <span className="text-[13px] font-medium text-foreground/80">Steps ({run.steps.length})</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {run.steps.map((step, i) => (
                <div key={i} className="rounded-md border border-border/40 p-3 text-[13px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground/80">{step.name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-md ${
                      step.status === 'success' ? 'bg-foreground/[0.06] text-muted-foreground' : 'bg-destructive/10 text-destructive'
                    }`}>
                      {step.status}
                    </span>
                  </div>
                  {step.duration && <div className="text-[11px] text-muted-foreground/60">{step.duration}</div>}
                  {step.error && <div className="text-[11px] text-destructive">{step.error}</div>}
                  {step.output && (
                    <pre className="bg-[#0d0f12] text-zinc-300 p-2 rounded-md text-[11px] overflow-auto max-h-40 mt-2">
                      {step.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TmuxCard({ tmux }: { tmux: NonNullable<RunRecord['tmux']> }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(tmux.attach)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-border/40">
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-[13px] font-medium text-foreground/80">tmux Session</span>
      </div>
      <div className="px-4 py-3 text-[13px] space-y-3">
        <Row label="Session" value={tmux.session} />
        <Row label="Log File" value={tmux.log_file} />
        <Row label="TTL" value={tmux.ttl} />
        <div className="flex items-center gap-2">
          <code className="bg-foreground/[0.04] px-2 py-1 rounded-md text-[11px] flex-1 truncate font-mono">{tmux.attach}</code>
          <button
            className="px-2.5 py-1 text-[12px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1 shrink-0"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground/80">{label}: </span>
      <span className="font-mono text-[11px]">{value}</span>
    </div>
  )
}
