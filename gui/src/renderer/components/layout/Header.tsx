import { FolderOpen } from 'lucide-react'
import { Badge } from '../ui/badge'
import { useStore } from '../../hooks/use-store'

export function Header() {
  const { workspacePath, configPath, dirty, processStatus } = useStore()

  const statusColor = {
    stopped: 'secondary',
    running: 'default',
    error: 'destructive'
  } as const

  const workspaceName = workspacePath?.split('/').pop()

  return (
    <div className="drag-region flex h-12 items-center justify-between border-b px-4">
      <div className="no-drag flex items-center gap-2 text-sm">
        <span className="font-semibold">Agent Orchestra</span>
        {workspaceName && (
          <span className="text-muted-foreground flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {workspaceName}
          </span>
        )}
        {configPath && (
          <span className="text-muted-foreground">
            / {configPath.split('/').pop()}
            {dirty && ' *'}
          </span>
        )}
      </div>
      <div className="no-drag">
        <Badge variant={statusColor[processStatus]}>{processStatus}</Badge>
      </div>
    </div>
  )
}
