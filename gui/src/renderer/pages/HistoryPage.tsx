import { useEffect, useState } from 'react'
import { RefreshCw, Terminal, Copy, Check, Play, Filter } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ScrollArea } from '../components/ui/scroll-area'
import { useStore } from '../hooks/use-store'
import { cn } from '../lib/utils'
import type { RunRecord } from '../types/state'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  running: 'default',
  success: 'secondary',
  failure: 'destructive',
  canceled: 'secondary'
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
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
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
      <div className="w-80 border-r flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Runs ({filtered.length})</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadHistory}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto">
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'secondary' : 'ghost'}
              className="h-6 text-xs px-2"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? `All (${runHistory.length})` : `${s} (${statusCounts[s] || 0})`}
            </Button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">
                {runHistory.length === 0 ? 'No runs yet' : 'No runs match filter'}
              </p>
            ) : (
              filtered.map((run) => (
                <div
                  key={run.id}
                  className={cn(
                    'rounded-md px-3 py-2 cursor-pointer hover:bg-accent transition-colors',
                    selectedRun?.id === run.id && 'bg-accent'
                  )}
                  onClick={() => setSelectedRun(run)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{run.pipeline}</span>
                    <Badge variant={statusVariant[run.status] || 'secondary'} className="text-[10px]">
                      {run.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(run.started_at).toLocaleString()}
                    {run.duration && ` — ${run.duration}`}
                  </div>
                  {run.tmux && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Terminal className="h-3 w-3" />
                      <span className="truncate">{run.tmux.session}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Run detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRun ? (
          <RunDetail run={selectedRun} onRerun={handleRerun} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Select a run to view details
          </div>
        )}
      </div>
    </div>
  )
}

function RunDetail({ run, onRerun }: { run: RunRecord; onRerun: (run: RunRecord) => void }) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-4 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{run.pipeline}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onRerun(run)}>
              <Play className="h-3 w-3 mr-1" /> Re-run
            </Button>
            <Badge variant={statusVariant[run.status] || 'secondary'}>{run.status}</Badge>
          </div>
        </div>

        {/* Info */}
        <Card>
          <CardContent className="pt-4 text-sm space-y-2">
            <Row label="ID" value={run.id} />
            <Row label="Config" value={run.config} />
            <Row label="Started" value={new Date(run.started_at).toLocaleString()} />
            {run.ended_at && <Row label="Ended" value={new Date(run.ended_at).toLocaleString()} />}
            {run.duration && <Row label="Duration" value={run.duration} />}
            {run.error && (
              <div>
                <span className="text-muted-foreground">Error: </span>
                <span className="text-destructive">{run.error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* tmux */}
        {run.tmux && <TmuxCard tmux={run.tmux} />}

        {/* SSH only */}
        {run.ssh && !run.tmux && (
          <Card>
            <CardContent className="pt-4 text-sm space-y-2">
              <Row label="SSH Host" value={`${run.ssh.user}@${run.ssh.host}`} />
              {run.ssh.port > 0 && <Row label="Port" value={String(run.ssh.port)} />}
            </CardContent>
          </Card>
        )}

        {/* Steps */}
        {run.steps.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Steps ({run.steps.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {run.steps.map((step, i) => (
                <div key={i} className="rounded border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{step.name}</span>
                    <Badge variant={step.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px]">
                      {step.status}
                    </Badge>
                  </div>
                  {step.duration && <div className="text-xs text-muted-foreground">{step.duration}</div>}
                  {step.error && <div className="text-xs text-destructive">{step.error}</div>}
                  {step.output && (
                    <pre className="bg-zinc-950 text-zinc-300 p-2 rounded text-xs overflow-auto max-h-40 mt-2">
                      {step.output}
                    </pre>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Terminal className="h-4 w-4" /> tmux Session
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <Row label="Session" value={tmux.session} />
        <Row label="Log File" value={tmux.log_file} />
        <Row label="TTL" value={tmux.ttl} />
        <div className="flex items-center gap-2">
          <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate">{tmux.attach}</code>
          <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  )
}
