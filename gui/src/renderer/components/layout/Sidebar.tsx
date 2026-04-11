import { Settings, Play, FileText, Home } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useStore } from '../../hooks/use-store'

const nav = [
  { id: 'welcome' as const, label: 'Home', icon: Home },
  { id: 'config' as const, label: 'Config', icon: Settings },
  { id: 'execution' as const, label: 'Run', icon: Play },
  { id: 'logs' as const, label: 'Logs', icon: FileText }
]

export function Sidebar() {
  const { page, setPage, processStatus, dirty } = useStore()

  return (
    <div className="flex h-full w-14 flex-col items-center border-r bg-muted/40 pt-12 pb-4 gap-2">
      {nav.map((item) => (
        <Button
          key={item.id}
          variant={page === item.id ? 'secondary' : 'ghost'}
          size="icon"
          className={cn('relative h-10 w-10', page === item.id && 'bg-secondary')}
          onClick={() => setPage(item.id)}
          title={item.label}
        >
          <item.icon className="h-5 w-5" />
          {item.id === 'config' && dirty && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-500" />
          )}
          {item.id === 'execution' && processStatus === 'running' && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[8px] bg-green-500">
              !
            </Badge>
          )}
        </Button>
      ))}
    </div>
  )
}
