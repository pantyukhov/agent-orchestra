import { Settings, Play, FileText, Home, History } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../../lib/utils'
import { useStore } from '../../hooks/use-store'

const nav = [
  { id: 'welcome' as const, label: 'Home', icon: Home },
  { id: 'config' as const, label: 'Config', icon: Settings },
  { id: 'execution' as const, label: 'Run', icon: Play },
  { id: 'history' as const, label: 'History', icon: History },
  { id: 'logs' as const, label: 'Logs', icon: FileText }
]

export function Sidebar() {
  const { page, setPage, processStatus, dirty } = useStore()

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border/50 bg-background/80 backdrop-blur-xl pt-11 pb-3 gap-1">
      {nav.map((item) => (
        <button
          key={item.id}
          className={cn(
            'relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150',
            page === item.id
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          )}
          onClick={() => setPage(item.id)}
          title={item.label}
        >
          <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
          {page === item.id && (
            <motion.div
              layoutId="sidebar-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[1px] w-[3px] h-4 rounded-full bg-foreground/70"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          {item.id === 'config' && dirty && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-orange-400" />
          )}
          {item.id === 'execution' && processStatus === 'running' && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </button>
      ))}
    </div>
  )
}
