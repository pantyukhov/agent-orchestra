import { useEffect, useRef } from 'react'
import { Play, Square, RotateCw } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Switch } from '../components/ui/switch'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { useStore } from '../hooks/use-store'
import { useState } from 'react'

export function ExecutionPage() {
  const {
    configPath,
    processStatus,
    processOutput,
    orchestratorState,
    setProcessStatus,
    appendOutput,
    clearOutput,
    setOrchestratorState
  } = useStore()

  const [once, setOnce] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub1 = window.electronAPI.onProcessOutput((data) => {
      appendOutput(data)
    })
    const unsub2 = window.electronAPI.onProcessStatusChange((status) => {
      setProcessStatus(status as any)
    })
    const unsub3 = window.electronAPI.onStateUpdate((state) => {
      setOrchestratorState(state as any)
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [processOutput])

  const handleStart = async () => {
    if (!configPath) return
    clearOutput()
    await window.electronAPI.startProcess(configPath, once)

    // Start watching state file if orchestrator config
    const config = useStore.getState().config
    if (config?.orchestrator?.persistence?.file) {
      await window.electronAPI.watchState(config.orchestrator.persistence.file)
    }
  }

  const handleStop = async () => {
    await window.electronAPI.stopProcess()
  }

  const statusColor = {
    stopped: 'secondary',
    running: 'default',
    error: 'destructive'
  } as const

  return (
    <div className="flex flex-1 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button
          size="sm"
          onClick={handleStart}
          disabled={processStatus === 'running' || !configPath}
          className="bg-green-600 hover:bg-green-700"
        >
          <Play className="h-4 w-4 mr-1" /> Start
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStop}
          disabled={processStatus !== 'running'}
        >
          <Square className="h-4 w-4 mr-1" /> Stop
        </Button>
        <Button size="sm" variant="outline" onClick={clearOutput}>
          <RotateCw className="h-4 w-4 mr-1" /> Clear
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Switch checked={once} onCheckedChange={setOnce} />
          <Label className="text-sm">Single run (--once)</Label>
        </div>

        <div className="flex-1" />
        <Badge variant={statusColor[processStatus]}>{processStatus}</Badge>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Output terminal */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={outputRef}
            className="flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-relaxed"
          >
            {processOutput.length === 0 ? (
              <span className="text-zinc-500">
                {configPath
                  ? 'Press Start to run agent-orchestra...'
                  : 'Open a config file first'}
              </span>
            ) : (
              processOutput.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* State panel */}
        <div className="w-72 border-l">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">State</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  {orchestratorState ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Poll count</span>
                        <span className="font-mono">{orchestratorState.poll_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Started</span>
                        <span className="font-mono">
                          {orchestratorState.started_at
                            ? new Date(orchestratorState.started_at).toLocaleTimeString()
                            : '—'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No state yet</span>
                  )}
                </CardContent>
              </Card>

              {orchestratorState && Object.keys(orchestratorState.locks || {}).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Active Locks</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    {Object.entries(orchestratorState.locks).map(([id, lock]) => (
                      <div key={id} className="rounded border p-2 space-y-1">
                        <div className="font-mono font-medium truncate">{id}</div>
                        <div className="text-muted-foreground">Pipeline: {lock.pipeline}</div>
                        <div className="text-muted-foreground">
                          Since: {new Date(lock.started_at).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
