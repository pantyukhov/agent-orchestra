import { useMemo, useState } from 'react'
import { Save, Plus, FileText, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { TriggerForm } from '../components/config/TriggerForm'
import { PipelineForm } from '../components/config/PipelineForm'
import { StepForm } from '../components/config/StepForm'
import { useStore } from '../hooks/use-store'
import type {
  Config,
  OrchestratorConfig,
  PipelineConfig,
  DefaultsConfig,
  TriggerConfig,
  PipelineDef,
  StepConfig
} from '../types/config'

export function ConfigEditorPage() {
  const { workspacePath, workspaceConfigs, config, configPath, dirty, updateConfig, setDirty, setConfig, clearConfig } =
    useStore()
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  if (!workspacePath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Open a workspace first
      </div>
    )
  }

  const handleSelectConfig = async (path: string) => {
    setLoading(true)
    try {
      const content = await window.electronAPI.loadConfigFile(path)
      setConfig(path, content)
    } catch (e) {
      console.error('Failed to load config:', e)
    } finally {
      setLoading(false)
    }
  }

  // Config list view
  if (!config || !configPath) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-medium">Configs</span>
          <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{workspacePath}</span>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2 max-w-xl">
            {workspaceConfigs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No YAML configs found in workspace</p>
            ) : (
              workspaceConfigs.map((p) => (
                <Card
                  key={p}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleSelectConfig(p)}
                >
                  <CardHeader className="py-3 px-4 flex flex-row items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <CardTitle className="text-sm font-mono flex-1">
                      {p.replace(workspacePath + '/', '')}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      await window.electronAPI.saveConfigFile(configPath, config)
      setDirty(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const handleBack = () => {
    clearConfig()
  }

  const toolbar = (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <Button size="sm" variant="ghost" onClick={handleBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Configs
      </Button>
      <Separator orientation="vertical" className="h-5" />
      <Button size="sm" onClick={handleSave} disabled={!dirty || saveStatus === 'saving'}>
        {saveStatus === 'saving' ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-1" />
        )}
        Save
      </Button>
      {saveStatus === 'saved' && <Badge variant="secondary" className="text-xs">Saved</Badge>}
      {saveStatus === 'error' && <Badge variant="destructive" className="text-xs">Save failed</Badge>}
      <span className="text-xs text-muted-foreground font-mono flex-1 truncate">
        {configPath.replace(workspacePath + '/', '')}
      </span>
      <Badge variant="outline" className="text-xs">
        {config.orchestrator ? 'orchestrator' : 'pipeline'}
      </Badge>
    </div>
  )

  // Pipeline mode editor
  if (config.pipeline) {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <PipelineEditor config={config} updateConfig={updateConfig} />
      </div>
    )
  }

  // Orchestrator mode editor
  if (config.orchestrator) {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <OrchestratorEditor config={config} updateConfig={updateConfig} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      Unknown config format
    </div>
  )
}

// ── Pipeline Editor ──────────────────────────────────────────────

function PipelineEditor({
  config,
  updateConfig
}: {
  config: Config
  updateConfig: (c: Config) => void
}) {
  const pipe = config.pipeline!

  const updatePipe = (patch: Partial<PipelineConfig>) => {
    updateConfig({ ...config, pipeline: { ...pipe, ...patch } })
  }

  const updateDefaults = (patch: Partial<DefaultsConfig>) => {
    updatePipe({ defaults: { ...pipe.defaults, ...patch } })
  }

  const updateStep = (index: number, step: StepConfig) => {
    const steps = [...pipe.steps]
    steps[index] = step
    updatePipe({ steps })
  }

  const removeStep = (index: number) => {
    updatePipe({ steps: pipe.steps.filter((_, i) => i !== index) })
  }

  const addStep = (type: 'agent' | 'action') => {
    const newStep: StepConfig =
      type === 'action'
        ? { action: 'git-save' }
        : { name: `step-${pipe.steps.length + 1}`, prompt: '' }
    updatePipe({ steps: [...pipe.steps, newStep] })
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6 max-w-3xl">
        {/* General */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">General</h2>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={pipe.name} onChange={(e) => updatePipe({ name: e.target.value })} />
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
                value={pipe.defaults?.command || ''}
                onChange={(e) => updateDefaults({ command: e.target.value })}
                placeholder="claude"
              />
            </div>
            <div className="space-y-1">
              <Label>Timeout</Label>
              <Input
                value={pipe.defaults?.timeout || ''}
                onChange={(e) => updateDefaults({ timeout: e.target.value })}
                placeholder="30m"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Args (comma-separated)</Label>
            <Input
              value={(pipe.defaults?.args || []).join(', ')}
              onChange={(e) =>
                updateDefaults({ args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="--dangerously-skip-permissions, -p"
            />
          </div>
        </section>

        <Separator />

        {/* Loop */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Loop</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Count (0 = infinite)</Label>
              <Input
                type="number"
                value={pipe.loop?.count ?? 0}
                onChange={(e) => updatePipe({ loop: { ...pipe.loop, count: parseInt(e.target.value) || 0 } })}
              />
            </div>
            <div className="space-y-1">
              <Label>Delay between iterations</Label>
              <Input
                value={pipe.loop?.delay || ''}
                onChange={(e) => updatePipe({ loop: { ...pipe.loop, delay: e.target.value } })}
                placeholder="5s"
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* SSH */}
        {pipe.defaults?.ssh && (
          <>
            <SSHSection
              ssh={pipe.defaults.ssh}
              onChange={(ssh) => updateDefaults({ ssh })}
            />
            <Separator />
          </>
        )}

        {!pipe.defaults?.ssh && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateDefaults({ ssh: { host: '', user: '' } })}
            >
              <Plus className="h-4 w-4 mr-1" /> Add SSH Remote Execution
            </Button>
            <Separator />
          </>
        )}

        {/* Steps */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Steps ({pipe.steps.length})</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => addStep('agent')}>
                <Plus className="h-3 w-3 mr-1" /> Agent Step
              </Button>
              <Button size="sm" variant="outline" onClick={() => addStep('action')}>
                <Plus className="h-3 w-3 mr-1" /> Action
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {pipe.steps.map((step, i) => (
              <StepForm key={i} step={step} index={i} onChange={updateStep} onRemove={removeStep} />
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}

// ── SSH Section ──────────────────────────────────────────────────

function SSHSection({
  ssh,
  onChange
}: {
  ssh: any
  onChange: (ssh: any) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">SSH Remote Execution</h2>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(undefined)}>
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Host</Label>
          <Input value={ssh.host || ''} onChange={(e) => onChange({ ...ssh, host: e.target.value })} placeholder="192.168.1.100" />
        </div>
        <div className="space-y-1">
          <Label>User</Label>
          <Input value={ssh.user || ''} onChange={(e) => onChange({ ...ssh, user: e.target.value })} placeholder="deploy" />
        </div>
        <div className="space-y-1">
          <Label>Port</Label>
          <Input type="number" value={ssh.port || 22} onChange={(e) => onChange({ ...ssh, port: parseInt(e.target.value) || 22 })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Key File</Label>
        <Input value={ssh.key_file || ''} onChange={(e) => onChange({ ...ssh, key_file: e.target.value })} placeholder="~/.ssh/id_ed25519 (auto-detected if empty)" />
      </div>
      {/* tmux */}
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">tmux</p>
          {!ssh.tmux ? (
            <Button size="sm" variant="outline" onClick={() => onChange({ ...ssh, tmux: { session: '', ttl: '72h' } })}>
              Enable
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-destructive text-xs" onClick={() => onChange({ ...ssh, tmux: undefined })}>
              Disable
            </Button>
          )}
        </div>
        {ssh.tmux && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Session Name</Label>
              <Input className="h-8 text-xs" value={ssh.tmux.session || ''} onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, session: e.target.value } })} placeholder="auto from step name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">TTL</Label>
              <Input className="h-8 text-xs" value={ssh.tmux.ttl || '72h'} onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, ttl: e.target.value } })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Log Dir</Label>
              <Input className="h-8 text-xs" value={ssh.tmux.log_dir || ''} onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, log_dir: e.target.value } })} placeholder="/tmp/agent-orchestra" />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Orchestrator Editor ──────────────────────────────────────────

function OrchestratorEditor({
  config,
  updateConfig
}: {
  config: Config
  updateConfig: (c: Config) => void
}) {
  const orch = config.orchestrator!

  const pipelineNames = useMemo(() => Object.keys(orch.pipelines || {}), [orch.pipelines])

  const updateOrch = (patch: Partial<OrchestratorConfig>) => {
    updateConfig({ ...config, orchestrator: { ...orch, ...patch } })
  }

  const updateTrigger = (index: number, trigger: TriggerConfig) => {
    const triggers = [...orch.triggers]
    triggers[index] = trigger
    updateOrch({ triggers })
  }
  const removeTrigger = (index: number) => updateOrch({ triggers: orch.triggers.filter((_, i) => i !== index) })
  const addTrigger = () => {
    updateOrch({
      triggers: [
        ...orch.triggers,
        {
          name: `trigger-${orch.triggers.length + 1}`,
          type: 'gitlab-issues' as const,
          gitlab: { project: '' },
          poll_interval: '4h',
          priority: orch.triggers.length + 1,
          pipeline: pipelineNames[0] || ''
        }
      ]
    })
  }

  const updatePipeline = (name: string, pipeline: PipelineDef) => updateOrch({ pipelines: { ...orch.pipelines, [name]: pipeline } })
  const removePipeline = (name: string) => {
    const { [name]: _, ...rest } = orch.pipelines
    updateOrch({ pipelines: rest })
  }
  const renamePipeline = (oldName: string, newName: string) => {
    if (oldName === newName || !newName) return
    const entries = Object.entries(orch.pipelines).map(([k, v]) => [k === oldName ? newName : k, v] as const)
    const pipelines = Object.fromEntries(entries)
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
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6 max-w-3xl">
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Command</Label>
              <Input value={orch.defaults?.command || ''} onChange={(e) => updateOrch({ defaults: { ...orch.defaults, command: e.target.value } })} />
            </div>
            <div className="space-y-1">
              <Label>Timeout</Label>
              <Input value={orch.defaults?.timeout || ''} onChange={(e) => updateOrch({ defaults: { ...orch.defaults, timeout: e.target.value } })} placeholder="30m" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Args (comma-separated)</Label>
            <Input
              value={(orch.defaults?.args || []).join(', ')}
              onChange={(e) => updateOrch({ defaults: { ...orch.defaults, args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Runtime</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Max Concurrency</Label>
              <Input type="number" value={orch.concurrency?.max || 1} onChange={(e) => updateOrch({ concurrency: { max: parseInt(e.target.value) || 1 } })} />
            </div>
            <div className="space-y-1">
              <Label>Log Directory</Label>
              <Input value={orch.logging?.dir || './logs'} onChange={(e) => updateOrch({ logging: { ...orch.logging!, dir: e.target.value, per_task: orch.logging?.per_task ?? true } })} />
            </div>
            <div className="space-y-1">
              <Label>State File</Label>
              <Input value={orch.persistence?.file || ''} onChange={(e) => updateOrch({ persistence: { file: e.target.value } })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={orch.logging?.per_task ?? true} onCheckedChange={(v) => updateOrch({ logging: { dir: orch.logging?.dir || './logs', per_task: v } })} />
            <Label>Per-task logging</Label>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Triggers ({orch.triggers.length})</h2>
            <Button size="sm" variant="outline" onClick={addTrigger}><Plus className="h-4 w-4 mr-1" /> Add Trigger</Button>
          </div>
          <div className="space-y-4">
            {orch.triggers.map((trigger, i) => (
              <TriggerForm key={i} trigger={trigger} index={i} pipelineNames={pipelineNames} onChange={updateTrigger} onRemove={removeTrigger} />
            ))}
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pipelines ({Object.keys(orch.pipelines).length})</h2>
            <Button size="sm" variant="outline" onClick={addPipeline}><Plus className="h-4 w-4 mr-1" /> Add Pipeline</Button>
          </div>
          <div className="space-y-4">
            {Object.entries(orch.pipelines).map(([name, pipeline]) => (
              <PipelineForm key={name} name={name} pipeline={pipeline} onChange={updatePipeline} onRemove={removePipeline} onRename={renamePipeline} />
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}
