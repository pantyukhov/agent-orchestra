import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { FolderOpen, Clock, Loader2 } from 'lucide-react'
import { useStore } from '../hooks/use-store'

export function WelcomePage() {
  const { setWorkspace, setPage, workspacePath } = useStore()
  const [recent, setRecent] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getRecentWorkspaces().then(async (list) => {
      setRecent(list)
      if (!workspacePath && list.length > 0) {
        await openWorkspace(list[0])
      }
      setLoading(false)
    })
  }, [])

  const handleOpen = async () => {
    const dir = await window.electronAPI.openWorkspace()
    if (!dir) return
    await openWorkspace(dir)
  }

  const openWorkspace = async (dir: string) => {
    setLoading(true)
    try {
      const configs = await window.electronAPI.getWorkspaceConfigs(dir)
      setWorkspace(dir, configs)
      setPage('config')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <motion.div
        className="w-full max-w-sm space-y-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-medium tracking-tight">Agent Orchestra</h1>
          <p className="text-[13px] text-muted-foreground">Orchestrate AI agents with YAML pipelines</p>
        </div>

        <button
          onClick={handleOpen}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 hover:bg-accent/30 active:scale-[0.98] active:opacity-80 transition-all duration-150 group"
        >
          <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
          <div className="text-left">
            <div className="text-[13px]">Open Workspace</div>
            <div className="text-[11px] text-muted-foreground">Select a folder with configs</div>
          </div>
        </button>

        {recent.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Clock className="h-3 w-3 text-muted-foreground/60" strokeWidth={1.5} />
              <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">Recent</span>
            </div>
            <div className="space-y-0.5">
              {recent.map((path, i) => (
                <motion.button
                  key={path}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  className="w-full text-left px-3.5 py-2.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/50 active:scale-[0.98] active:opacity-80 transition-all duration-100 font-mono truncate"
                  onClick={() => openWorkspace(path)}
                >
                  {path.replace(/.*\//, '~/')}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
