import { useMemo } from 'react'
import { Save, Plus, FolderOpen } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { TriggerForm } from '../components/config/TriggerForm'
import { PipelineForm } from '../components/config/PipelineForm'
import { useStore } from '../hooks/use-store'
import type { Config, OrchestratorConfig, TriggerConfig, PipelineDef } from '../types/config'

export function ConfigEditorPage() {
  const { config, configPath, dirty, updateConfig, setDirty } = useStore()

  if (!config || !configPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Open a config file first
      </div>
    )
  }

  const orch = config.orchestrator
  if (!orch) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Pipeline mode editor coming soon. Currently only orchestrator mode is supported.
      </div>
    )
  }

  const pipelineNames = useMemo(() => Object.keys(orch.pipelines || {}), [orch.pipelines])

  const updateOrch = (patch: Partial<OrchestratorConfig>) => {
    updateConfig({ ...config, orchestrator: { ...orch, ...patch } })
  }

  const handleSave = async () => {
    await window.electronAPI.saveConfigFile(configPath, config)
    setDirty(false)
  }

  // Trigger handlers
  const updateTrigger = (index: number, trigger: TriggerConfig) => {
    const triggers = [...orch.triggers]
    triggers[index] = trigger
    updateOrch({ triggers })
  }

  const removeTrigger = (index: number) => {
    updateOrch({ triggers: orch.triggers.filter((_, i) => i !== index) })
  }

  const addTrigger = () => {
    const t: TriggerConfig = {
      name: `trigger-${orch.triggers.length + 1}`,
      type: 'gitlab-issues',
      gitlab: { project: '' },
      poll_interval: '4h',
      priority: orch.triggers.length + 1,
      pipeline: pipelineNames[0] || ''
    }
    updateOrch({ triggers: [...orch.triggers, t] })
  }

  // Pipeline handlers
  const updatePipeline = (name: string, pipeline: PipelineDef) => {
    updateOrch({ pipelines: { ...orch.pipelines, [name]: pipeline } })
  }

  const removePipeline = (name: string) => {
    const { [name]: _, ...rest } = orch.pipelines
    updateOrch({ pipelines: rest })
  }

  const renamePipeline = (oldName: string, newName: string) => {
    if (oldName === newName || !newName) return
    const entries = Object.entries(orch.pipelines).map(([k, v]) => [k === oldName ? newName : k, v] as const)
    const pipelines = Object.fromEntries(entries)
    // Update trigger references
    const triggers = orch.triggers.map((t) => (t.pipeline === oldName ? { ...t, pipeline: newName } : t))
    updateOrch({ pipelines, triggers })
  }

  const addPipeline = () => {
    const name = `pipeline-${Object.keys(orch.pipelines).length + 1}`
    updateOrch({
      pipelines: {
        ...orch.pipelines,
        [name]: {
          state: {
            on_start: { remove_labels: [], add_labels: ['ai:in-progress'] },
            on_success: { remove_labels: ['ai:in-progress'], add_labels: ['ai:done'] },
            on_failure: { remove_labels: ['ai:in-progress'], add_labels: ['ai:failed'] }
          },
          steps: [{ name: 'step-1', prompt: '' }]
        }
      }
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button size="sm" onClick={handleSave} disabled={!dirty}>
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
        <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{configPath}</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-3xl">
          {/* General */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">General</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={orch.name} onChange={(e) => updateOrch({ name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Project Root</Label>
                <Input value={orch.project_root || '.'} onChange={(e) => updateOrch({ project_root: e.target.value })} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Defaults */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Defaults</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Command</Label>
                <Input
                  value={orch.defaults?.command || ''}
                  onChange={(e) => updateOrch({ defaults: { ...orch.defaults, command: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label>Timeout</Label>
                <Input
                  value={orch.defaults?.timeout || ''}
                  onChange={(e) => updateOrch({ defaults: { ...orch.defaults, timeout: e.target.value } })}
                  placeholder="30m"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Args (comma-separated)</Label>
              <Input
                value={(orch.defaults?.args || []).join(', ')}
                onChange={(e) =>
                  updateOrch({
                    defaults: { ...orch.defaults, args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }
                  })
                }
              />
            </div>
          </section>

          <Separator />

          {/* Concurrency & Logging */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Runtime</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Max Concurrency</Label>
                <Input
                  type="number"
                  value={orch.concurrency?.max || 1}
                  onChange={(e) => updateOrch({ concurrency: { max: parseInt(e.target.value) || 1 } })}
                />
              </div>
              <div className="space-y-1">
                <Label>Log Directory</Label>
                <Input
                  value={orch.logging?.dir || './logs'}
                  onChange={(e) => updateOrch({ logging: { ...orch.logging!, dir: e.target.value, per_task: orch.logging?.per_task ?? true } })}
                />
              </div>
              <div className="space-y-1">
                <Label>State File</Label>
                <Input
                  value={orch.persistence?.file || ''}
                  onChange={(e) => updateOrch({ persistence: { file: e.target.value } })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={orch.logging?.per_task ?? true}
                onCheckedChange={(v) => updateOrch({ logging: { dir: orch.logging?.dir || './logs', per_task: v } })}
              />
              <Label>Per-task logging</Label>
            </div>
          </section>

          <Separator />

          {/* Triggers */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Triggers ({orch.triggers.length})</h2>
              <Button size="sm" variant="outline" onClick={addTrigger}>
                <Plus className="h-4 w-4 mr-1" /> Add Trigger
              </Button>
            </div>
            <div className="space-y-4">
              {orch.triggers.map((trigger, i) => (
                <TriggerForm
                  key={i}
                  trigger={trigger}
                  index={i}
                  pipelineNames={pipelineNames}
                  onChange={updateTrigger}
                  onRemove={removeTrigger}
                />
              ))}
            </div>
          </section>

          <Separator />

          {/* Pipelines */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pipelines ({Object.keys(orch.pipelines).length})</h2>
              <Button size="sm" variant="outline" onClick={addPipeline}>
                <Plus className="h-4 w-4 mr-1" /> Add Pipeline
              </Button>
            </div>
            <div className="space-y-4">
              {Object.entries(orch.pipelines).map(([name, pipeline]) => (
                <PipelineForm
                  key={name}
                  name={name}
                  pipeline={pipeline}
                  onChange={updatePipeline}
                  onRemove={removePipeline}
                  onRename={renamePipeline}
                />
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
