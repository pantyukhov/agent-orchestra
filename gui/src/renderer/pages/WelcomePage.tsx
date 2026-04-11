import { useEffect, useState } from 'react'
import { FolderOpen, Plus, Clock } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useStore } from '../hooks/use-store'

export function WelcomePage() {
  const { setConfig } = useStore()
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getRecentConfigs().then(setRecent)
  }, [])

  const handleOpen = async () => {
    const result = await window.electronAPI.openConfigFile()
    if (result) {
      setConfig(result.path, result.content)
    }
  }

  const handleNew = async (mode: 'pipeline' | 'orchestrator') => {
    const dir = await window.electronAPI.selectDirectory()
    if (!dir) return
    const path = await window.electronAPI.createNewConfig(dir, mode)
    const result = await window.electronAPI.openConfigFile()
    if (result) {
      setConfig(result.path, result.content)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Agent Orchestra</h1>
          <p className="text-muted-foreground">AI agent workflow orchestrator</p>
        </div>

        <div className="grid gap-4 grid-cols-2">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleOpen}>
            <CardHeader className="pb-3">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-lg">Open Config</CardTitle>
              <CardDescription>Open an existing YAML config</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => handleNew('orchestrator')}
          >
            <CardHeader className="pb-3">
              <Plus className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-lg">New Orchestrator</CardTitle>
              <CardDescription>Create scheduled event-driven config</CardDescription>
            </CardHeader>
          </Card>
        </div>

        {recent.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {recent.map((path) => (
                <Button
                  key={path}
                  variant="ghost"
                  className="w-full justify-start text-sm font-mono h-8"
                  onClick={async () => {
                    const result = await window.electronAPI.openConfigFile()
                    if (result) setConfig(result.path, result.content)
                  }}
                >
                  {path.split('/').slice(-2).join('/')}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
