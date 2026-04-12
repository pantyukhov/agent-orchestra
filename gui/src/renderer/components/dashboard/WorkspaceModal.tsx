import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FolderOpen, Clock } from 'lucide-react'
import { useStore } from '../../hooks/use-store'

interface WorkspaceModalProps {
  open: boolean
}

export function WorkspaceModal({ open }: WorkspaceModalProps) {
  const [recent, setRecent] = useState<string[]>([])
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setPage = useStore((s) => s.setPage)

  useEffect(() => {
    if (open) {
      window.electronAPI.getRecentWorkspaces().then((list) => {
        setRecent(list)
        if (list.length > 0) {
          openWorkspace(list[0])
        }
      })
    }
  }, [open])

  async function openWorkspace(path?: string) {
    const dir = path ?? (await window.electronAPI.openWorkspace())
    if (!dir) return
    const configs = await window.electronAPI.getWorkspaceConfigs(dir)
    setWorkspace(dir, configs)
    setPage('dashboard')
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-8 w-[400px]"
          style={{
            background: 'rgba(28,28,30,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(40px)',
          }}
        >
          <h2 className="text-xl font-semibold text-[#f5f5f7] mb-1" style={{ letterSpacing: '-0.3px' }}>
            Agent Orchestra
          </h2>
          <p className="text-[13px] text-[#86868b] mb-6">
            Open a workspace to manage your agents
          </p>

          <button
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium cursor-pointer mb-6"
            style={{ background: 'rgba(10,132,255,0.15)', color: '#0a84ff' }}
            onClick={() => openWorkspace()}
          >
            <FolderOpen size={16} />
            Open Workspace
          </button>

          {recent.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={12} className="text-[#48484a]" />
                <span className="text-[11px] uppercase font-semibold text-[#48484a]" style={{ letterSpacing: '0.08em' }}>
                  Recent
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {recent.map((path) => (
                  <button
                    key={path}
                    className="text-left px-3 py-2 rounded-lg text-[13px] text-[#86868b] hover:text-[#f5f5f7] transition-colors cursor-pointer truncate"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                    onClick={() => openWorkspace(path)}
                  >
                    {path.split('/').pop()}
                    <span className="block text-[11px] text-[#48484a] truncate">{path}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
