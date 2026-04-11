import { useEffect } from 'react'
import { RefreshCw, Terminal, ExternalLink } from 'lucide-react'
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

export function HistoryPage() {
  const { workspacePath, runHistory, selectedRun, setRunHistory, setSelectedRun } = useStore()

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

  return (
    <div className="flex flex-1 min-h-0">
      {/* Run list */}
      <div className="w-80 border-r flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Runs ({runHistory.length})</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadHistory}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {runHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No runs yet</p>
            ) : (
              runHistory.map((run) => (
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
                  </div>
                  {run.duration && (
                    <div className="text-xs text-muted-foreground">{run.duration}</div>
                  )}
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
          <RunDetail run={selectedRun} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Select a run to view details
          </div>
        )}
      </div>
    </div>
  )
}

function RunDetail({ run }: { run: RunRecord }) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-4 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{run.pipeline}</h2>
          <Badge variant={statusVariant[run.status] || 'secondary'}>{run.status}</Badge>
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

        {/* SSH / tmux */}
        {run.tmux && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Terminal className="h-4 w-4" /> tmux Session
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Session" value={run.tmux.session} />
              <Row label="Log File" value={run.tmux.log_file} />
              <Row label="TTL" value={run.tmux.ttl} />
              <div>
                <span className="text-muted-foreground">Attach: </span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{run.tmux.attach}</code>
              </div>
            </CardContent>
          </Card>
        )}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  )
}
