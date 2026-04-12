import { motion } from 'motion/react'
import { cn } from '../../lib/utils'
import { useStore } from '../../hooks/use-store'

const nav = [
  { id: 'welcome' as const, label: 'Home', icon: HomeIcon },
  { id: 'config' as const, label: 'Configs', icon: ConfigIcon },
  { id: 'execution' as const, label: 'Run', icon: RunIcon },
  { id: 'history' as const, label: 'History', icon: HistoryIcon },
  { id: 'logs' as const, label: 'Logs', icon: LogsIcon }
]

export function Sidebar() {
  const { page, setPage, processStatus, dirty } = useStore()

  return (
    <div className="flex h-full w-11 flex-col items-center border-r border-border/40 pt-11 pb-3 gap-0.5">
      {nav.map((item) => (
        <button
          key={item.id}
          className={cn(
            'relative flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-100',
            page === item.id
              ? 'text-foreground'
              : 'text-muted-foreground/60 hover:text-muted-foreground'
          )}
          onClick={() => setPage(item.id)}
          title={item.label}
        >
          <item.icon active={page === item.id} />
          {page === item.id && (
            <motion.div
              layoutId="nav"
              className="absolute inset-0 rounded-md bg-foreground/[0.06]"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          {item.id === 'config' && dirty && (
            <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-orange-400/80" />
          )}
          {item.id === 'execution' && processStatus === 'running' && (
            <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-green-400 animate-pulse" />
          )}
        </button>
      ))}
    </div>
  )
}

// ── SF Symbols-inspired icons (thin, 16px) ──────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={active ? 1.4 : 1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" />
      <path d="M6 14V9h4v5" />
    </svg>
  )
}

function ConfigIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={active ? 1.4 : 1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M3 8h10M3 11.5h7" />
      <circle cx="12" cy="11.5" r="1.5" />
    </svg>
  )
}

function RunIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={active ? 1.4 : 1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 3.5v9l7-4.5-7-4.5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
    </svg>
  )
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={active ? 1.4 : 1.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.5l2.5 1.5" />
    </svg>
  )
}

function LogsIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={active ? 1.4 : 1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5h5.5l3 3V13a1 1 0 01-1 1H4a1 1 0 01-1-1V3.5a1 1 0 011-1z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M5.5 8h5M5.5 10.5h3.5" />
    </svg>
  )
}
