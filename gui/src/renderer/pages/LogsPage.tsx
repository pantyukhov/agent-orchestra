import { useEffect, useState } from 'react'
import { RefreshCw, FolderOpen, Search, Copy, Check, X } from 'lucide-react'
import { useStore } from '../hooks/use-store'
import { cn } from '../lib/utils'

export function LogsPage() {
  const { workspacePath, config, logFiles, selectedLog, logContent, setLogFiles, setSelectedLog, setLogContent } =
    useStore()
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const logDir = workspacePath
    ? workspacePath + '/' + (config?.orchestrator?.logging?.dir || config?.pipeline ? 'logs' : 'logs').replace(/^\.\//, '')
    : null

  const loadFiles = async () => {
    if (!logDir) return
    const files = await window.electronAPI.getLogFiles(logDir)
    setLogFiles(files)
  }

  useEffect(() => {
    loadFiles()
    const unsub = window.electronAPI.onLogFilesChanged((files) => setLogFiles(files as any))
    return unsub
  }, [workspacePath])

  const handleSelect = async (path: string) => {
    setSelectedLog(path)
    const content = await window.electronAPI.readLogFile(path)
    setLogContent(content)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(logContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString()
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  if (!workspacePath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-[13px]">
        Open a workspace first
      </div>
    )
  }

  // Render log content with line numbers and search highlighting
  const renderContent = () => {
    if (!logContent) return <span className="text-zinc-500">Empty log file</span>

    const lines = logContent.split('\n')
    const searchLower = search.toLowerCase()

    return lines.map((line, i) => {
      const lineNum = i + 1
      const isMatch = search && line.toLowerCase().includes(searchLower)
      const isError = /\b(error|err|fatal|panic)\b/i.test(line)
      const isWarn = /\b(warn|warning)\b/i.test(line)

      return (
        <div
          key={i}
          className={cn(
            'flex',
            isMatch && 'bg-yellow-500/20',
            isError && !isMatch && 'text-red-400',
            isWarn && !isMatch && 'text-yellow-400'
          )}
        >
          <span className="w-12 shrink-0 text-right pr-3 text-zinc-600 select-none">{lineNum}</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{line}</span>
        </div>
      )
    })
  }

  const matchCount = search
    ? logContent.split('\n').filter((l) => l.toLowerCase().includes(search.toLowerCase())).length
    : 0

  return (
    <div className="flex flex-1 min-h-0">
      {/* File list */}
      <div className="w-72 border-r border-border/40 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
          <span className="text-[13px] font-medium text-foreground/80">Logs ({logFiles.length})</span>
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100"
            onClick={loadFiles}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-1">
            {logFiles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 p-2">No log files found</p>
            ) : (
              logFiles.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    'rounded-md px-3 py-2 cursor-pointer text-[11px] hover:bg-foreground/[0.04] transition-colors duration-100',
                    selectedLog === file.path && 'bg-foreground/[0.06]'
                  )}
                  onClick={() => handleSelect(file.path)}
                >
                  <div className="font-mono truncate text-foreground/80">{file.name}</div>
                  <div className="flex justify-between text-muted-foreground/60 mt-1">
                    <span>{formatSize(file.size)}</span>
                    <span>{formatDate(file.mtime)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Log content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedLog ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
              <span className="text-[11px] font-mono truncate text-muted-foreground/80">{selectedLog.split('/').pop()}</span>
              <div className="flex-1" />
              {/* Search */}
              <div className="relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                <input
                  className="w-full h-7 pl-7 pr-7 text-[11px] rounded-md border border-border/60 bg-transparent outline-none focus:border-foreground/20 focus:ring-1 focus:ring-foreground/10 transition-all duration-100 placeholder:text-muted-foreground/40"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <>
                    <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
                      {matchCount}
                    </span>
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-100"
                      onClick={() => setSearch('')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              <button
                className="px-2 py-1 text-[11px] rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                onClick={handleCopy}
                disabled={!logContent}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                className="px-2 py-1 text-[11px] rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1"
                onClick={() => window.electronAPI.showInFolder(selectedLog)}
              >
                <FolderOpen className="h-3.5 w-3.5" /> Reveal
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto bg-[#0d0f12] p-4 font-mono text-[11px] text-zinc-300 leading-relaxed">
              {renderContent()}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/60 text-[13px]">
            Select a log file to view
          </div>
        )}
      </div>
    </div>
  )
}
