import { useEffect, useRef, useState } from 'react'
import { Play, Square, RotateCw, Copy, Check, FileText } from 'lucide-react'
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

  const statusColors: Record<string, string> = {
    stopped: 'bg-foreground/[0.06] text-muted-foreground',
    running: 'bg-foreground/[0.08] text-foreground',
    error: 'bg-destructive/10 text-destructive'
  }
  const configName = configPath?.replace((workspacePath || '') + '/', '') || 'none'

  return (
    <div className="flex flex-1 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <button
          className="px-2.5 py-1 text-[12px] rounded-md bg-green-600/90 text-white hover:bg-green-600 transition-colors duration-100 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
          onClick={handleStart}
          disabled={processStatus === 'running' || !configPath}
        >
          <Play className="h-3.5 w-3.5" /> Start
        </button>
        <button
          className="px-2.5 py-1 text-[12px] rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors duration-100 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
          onClick={handleStop}
          disabled={processStatus !== 'running'}
        >
          <Square className="h-3.5 w-3.5" /> Stop
        </button>

        <div className="w-px h-6 bg-border/40" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={once}
            onClick={() => setOnce(!once)}
            className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${
              once ? 'bg-foreground/80' : 'bg-foreground/10'
            }`}
          >
            <span
              className={`pointer-events-none block h-[14px] w-[14px] rounded-full bg-background shadow-sm transition-transform duration-150 translate-y-[2px] ${
                once ? 'translate-x-[16px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
          <label className="text-[12px] text-muted-foreground/80">--once</label>
        </div>

        <div className="w-px h-6 bg-border/40" />

        {/* Config name with link */}
        <button
          className="px-2 py-1 text-[11px] font-mono rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
          onClick={handleGoToConfig}
          disabled={!configPath}
        >
          <FileText className="h-3 w-3" />
          {configName}
        </button>

        <div className="flex-1" />

        <span className={`px-1.5 py-0.5 text-[11px] rounded-md ${statusColors[processStatus] || statusColors.stopped}`}>
          {processStatus}
        </span>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Output terminal */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={outputRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto bg-[#0d0f12] p-4 font-mono text-[11px] text-zinc-200 leading-relaxed"
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
          <div className="flex items-center gap-2 border-t border-border/40 bg-[#0d0f12] px-4 py-1">
            <button
              className="px-2 py-0.5 text-[11px] rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1"
              onClick={clearOutput}
            >
              <RotateCw className="h-3 w-3" /> Clear
            </button>
            <button
              className="px-2 py-0.5 text-[11px] rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
              onClick={handleCopyOutput}
              disabled={processOutput.length === 0}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <div className="flex-1" />
            {!autoScroll && (
              <button
                className="px-2 py-0.5 text-[11px] rounded-md text-zinc-400 hover:text-zinc-200 transition-colors duration-100"
                onClick={() => setAutoScroll(true)}
              >
                Auto-scroll OFF — click to enable
              </button>
            )}
            <span className="text-[10px] text-zinc-600">{processOutput.length} lines</span>
          </div>
        </div>

        {/* State panel */}
        <div className="w-72 border-l border-border/40">
          <div className="h-full overflow-auto">
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-border/40">
                <div className="px-4 py-2.5 border-b border-border/40">
                  <span className="text-[13px] font-medium text-foreground/80">State</span>
                </div>
                <div className="px-4 py-3 text-[12px] space-y-2">
                  {orchestratorState ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground/80">Poll count</span>
                        <span className="font-mono text-[11px]">{orchestratorState.poll_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground/80">Started</span>
                        <span className="font-mono text-[11px]">
                          {orchestratorState.started_at ? new Date(orchestratorState.started_at).toLocaleTimeString() : '\u2014'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground/60">No state yet</span>
                  )}
                </div>
              </div>

              {orchestratorState && Object.keys(orchestratorState.locks || {}).length > 0 && (
                <div className="rounded-lg border border-border/40">
                  <div className="px-4 py-2.5 border-b border-border/40">
                    <span className="text-[13px] font-medium text-foreground/80">Active Locks ({Object.keys(orchestratorState.locks).length})</span>
                  </div>
                  <div className="px-4 py-3 text-[12px] space-y-2">
                    {Object.entries(orchestratorState.locks).map(([id, lock]) => (
                      <div key={id} className="rounded-md border border-border/40 p-2 space-y-1">
                        <div className="font-mono font-medium text-[11px] truncate">{id}</div>
                        <div className="text-muted-foreground/80 text-[11px]">Pipeline: {lock.pipeline}</div>
                        <div className="text-muted-foreground/80 text-[11px]">Since: {new Date(lock.started_at).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
