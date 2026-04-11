import { useEffect, useState } from 'react'
import { FolderOpen, Clock } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useStore } from '../hooks/use-store'

export function WelcomePage() {
  const { setWorkspace, setPage } = useStore()
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getRecentWorkspaces().then(setRecent)
  }, [])

  const handleOpen = async () => {
    const dir = await window.electronAPI.openWorkspace()
    if (!dir) return
    await openWorkspace(dir)
  }

  const openWorkspace = async (dir: string) => {
    const configs = await window.electronAPI.getWorkspaceConfigs(dir)
    setWorkspace(dir, configs)
    setPage('config')
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Agent Orchestra</h1>
          <p className="text-muted-foreground">AI agent workflow orchestrator</p>
        </div>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleOpen}>
          <CardHeader className="pb-3">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-lg">Open Workspace</CardTitle>
            <CardDescription>Open a folder with orchestrator configs</CardDescription>
          </CardHeader>
        </Card>

        {recent.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Workspaces
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {recent.map((path) => (
                <Button
                  key={path}
                  variant="ghost"
                  className="w-full justify-start text-sm font-mono h-8"
                  onClick={() => openWorkspace(path)}
                >
                  {path}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
