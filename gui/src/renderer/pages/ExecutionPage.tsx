import { useEffect, useRef, useState } from 'react'
import { Play, Square, RotateCw, Copy, Check, FileText } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Switch } from '../components/ui/switch'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { useStore } from '../hooks/use-store'

export function ExecutionPage() {
  const {
    configPath,
    workspacePath,
    config,
    processStatus,
    processOutput,
    orchestratorState,
    setProcessStatus,
    appendOutput,
    clearOutput,
    setOrchestratorState,
    setPage,
    setConfig
  } = useStore()

  const [once, setOnce] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub1 = window.electronAPI.onEngineEvent?.((event: any) => {
      // Convert engine events to output lines
      switch (event.type) {
        case 'pipeline:started':
          appendOutput(`Pipeline "${event.pipeline}" started (run: ${event.runId})\n`)
          break
        case 'step:started':
          appendOutput(`\n--- Step: ${event.stepName} ---\n$ ${event.command}\n`)
          break
        case 'step:output':
          appendOutput(event.line + '\n')
          break
        case 'step:completed':
          appendOutput(`\n--- Step "${event.stepName}" completed (${event.result.durationMs}ms) ---\n`)
          break
        case 'step:failed':
          appendOutput(`\n--- Step "${event.stepName}" FAILED: ${event.result.error} ---\n`)
          break
        case 'step:retry':
          appendOutput(`\n--- Retrying step "${event.stepName}" (attempt ${event.attempt}/${event.maxAttempts}) ---\n`)
          break
        case 'pipeline:completed':
          appendOutput(`\nPipeline completed successfully (${event.duration})\n`)
          break
        case 'pipeline:failed':
          appendOutput(`\nPipeline FAILED: ${event.error}\n`)
          break
        case 'pipeline:canceled':
          appendOutput(`\nPipeline canceled\n`)
          break
      }
    }) || (() => {})
    const unsub2 = window.electronAPI.onProcessStatusChange((status) => setProcessStatus(status as any))
    return () => { unsub1(); unsub2() }
  }, [])

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [processOutput, autoScroll])

  const handleScroll = () => {
    if (!outputRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
  }

  const handleStart = async () => {
    if (!configPath) return
    clearOutput()
    await window.electronAPI.startProcess(configPath, once)
  }

  const handleStop = () => window.electronAPI.stopProcess()

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(processOutput.join(''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGoToConfig = async () => {
    if (configPath) {
      const content = await window.electronAPI.loadConfigFile(configPath)
      setConfig(configPath, content)
      setPage('config')
    }
  }

  const statusColor = { stopped: 'secondary', running: 'default', error: 'destructive' } as const
  const configName = configPath?.replace((workspacePath || '') + '/', '') || 'none'

  return (
    <div className="flex flex-1 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button size="sm" onClick={handleStart} disabled={processStatus === 'running' || !configPath} className="bg-green-600 hover:bg-green-700">
          <Play className="h-4 w-4 mr-1" /> Start
        </Button>
        <Button size="sm" variant="destructive" onClick={handleStop} disabled={processStatus !== 'running'}>
          <Square className="h-4 w-4 mr-1" /> Stop
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Switch checked={once} onCheckedChange={setOnce} />
          <Label className="text-sm">--once</Label>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Config name with link */}
        <Button size="sm" variant="ghost" className="text-xs font-mono gap-1 h-7" onClick={handleGoToConfig} disabled={!configPath}>
          <FileText className="h-3 w-3" />
          {configName}
        </Button>

        <div className="flex-1" />

        <Badge variant={statusColor[processStatus]}>{processStatus}</Badge>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Output terminal */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={outputRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-relaxed"
          >
            {processOutput.length === 0 ? (
              <span className="text-zinc-500">
                {configPath ? 'Press Start to run agent-orchestra...' : 'Select a config first (Config tab)'}
              </span>
            ) : (
              processOutput.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))
            )}
          </div>
          {/* Output toolbar */}
          <div className="flex items-center gap-2 border-t bg-zinc-950 px-4 py-1">
            <Button size="sm" variant="ghost" className="h-6 text-xs text-zinc-400 hover:text-zinc-200" onClick={clearOutput}>
              <RotateCw className="h-3 w-3 mr-1" /> Clear
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs text-zinc-400 hover:text-zinc-200" onClick={handleCopyOutput} disabled={processOutput.length === 0}>
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <div className="flex-1" />
            {!autoScroll && (
              <Button size="sm" variant="ghost" className="h-6 text-xs text-zinc-400" onClick={() => setAutoScroll(true)}>
                Auto-scroll OFF — click to enable
              </Button>
            )}
            <span className="text-[10px] text-zinc-600">{processOutput.length} lines</span>
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
                          {orchestratorState.started_at ? new Date(orchestratorState.started_at).toLocaleTimeString() : '—'}
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
                    <CardTitle className="text-sm">Active Locks ({Object.keys(orchestratorState.locks).length})</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    {Object.entries(orchestratorState.locks).map(([id, lock]) => (
                      <div key={id} className="rounded border p-2 space-y-1">
                        <div className="font-mono font-medium truncate">{id}</div>
                        <div className="text-muted-foreground">Pipeline: {lock.pipeline}</div>
                        <div className="text-muted-foreground">Since: {new Date(lock.started_at).toLocaleTimeString()}</div>
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
