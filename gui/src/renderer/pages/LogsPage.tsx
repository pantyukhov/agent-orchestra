import { useEffect } from 'react'
import { RefreshCw, FolderOpen } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { useStore } from '../hooks/use-store'
import { cn } from '../lib/utils'

export function LogsPage() {
  const { config, configPath, logFiles, selectedLog, logContent, setLogFiles, setSelectedLog, setLogContent } =
    useStore()

  const logDir = config?.orchestrator?.logging?.dir || './logs'

  const loadFiles = async () => {
    if (!configPath) return
    const dir = configPath.replace(/[^/]+$/, '') + logDir.replace(/^\.\//, '')
    const files = await window.electronAPI.getLogFiles(dir)
    setLogFiles(files)
  }

  useEffect(() => {
    loadFiles()
    const unsub = window.electronAPI.onLogFilesChanged((files) => {
      setLogFiles(files as any)
    })
    return unsub
  }, [configPath])

  const handleSelect = async (path: string) => {
    setSelectedLog(path)
    const content = await window.electronAPI.readLogFile(path)
    setLogContent(content)
  }

  const handleShowInFolder = (path: string) => {
    window.electronAPI.showInFolder(path)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (!configPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Open a config file first
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* File list */}
      <div className="w-72 border-r flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Logs ({logFiles.length})</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadFiles}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {logFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No log files found</p>
            ) : (
              logFiles.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    'rounded-md px-3 py-2 cursor-pointer text-xs hover:bg-accent transition-colors',
                    selectedLog === file.path && 'bg-accent'
                  )}
                  onClick={() => handleSelect(file.path)}
                >
                  <div className="font-mono truncate">{file.name}</div>
                  <div className="flex justify-between text-muted-foreground mt-1">
                    <span>{formatSize(file.size)}</span>
                    <span>{new Date(file.mtime).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Log content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedLog ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="text-xs font-mono flex-1 truncate">{selectedLog}</span>
              <Button size="sm" variant="ghost" onClick={() => handleShowInFolder(selectedLog)}>
                <FolderOpen className="h-3.5 w-3.5 mr-1" /> Show
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {logContent || <span className="text-zinc-500">Empty log file</span>}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Select a log file to view
          </div>
        )}
      </div>
    </div>
  )
}
