import { useStore } from '../../hooks/use-store'

export function Header() {
  const { workspacePath, configPath, dirty, processStatus } = useStore()

  const workspaceName = workspacePath?.split('/').pop()

  const statusDot = {
    stopped: 'bg-muted-foreground/30',
    running: 'bg-green-400',
    error: 'bg-red-400'
  }

  return (
    <div className="drag-region flex h-10 items-center justify-between border-b border-border/50 px-4 bg-background">
      <div className="no-drag flex items-center gap-1.5 text-[13px]">
        {workspaceName && (
          <>
            <span className="text-muted-foreground">{workspaceName}</span>
            {configPath && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-foreground/80">
                  {configPath.split('/').pop()?.replace('.yaml', '')}
                  {dirty && <span className="text-muted-foreground ml-0.5">*</span>}
                </span>
              </>
            )}
          </>
        )}
      </div>
      <div className="no-drag flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot[processStatus]}`} />
        <span className="text-[11px] text-muted-foreground">{processStatus}</span>
      </div>
    </div>
  )
}
