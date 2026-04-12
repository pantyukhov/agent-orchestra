import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Save, Plus, FileText, ArrowLeft, Loader2, Play, Code, FormInput } from 'lucide-react'
import yaml from 'js-yaml'
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
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form')
  const [yamlText, setYamlText] = useState('')
  const [yamlError, setYamlError] = useState<string | null>(null)

  // ALL hooks must be above any early returns
  const handleSave = useCallback(async () => {
    if (!configPath || !config) return
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
  }, [configPath, config, setDirty])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirty, handleSave])

  // --- Early returns (after all hooks) ---

  if (!workspacePath) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-[13px]">
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

  const handleNewConfig = async (mode: 'pipeline' | 'orchestrator') => {
    const configsDir = workspacePath + '/configs'
    try {
      const path = await window.electronAPI.createNewConfig(configsDir, mode)
      const configs = await window.electronAPI.getWorkspaceConfigs(workspacePath)
      useStore.getState().setWorkspace(workspacePath, configs)
      const content = await window.electronAPI.loadConfigFile(path)
      setConfig(path, content)
    } catch (e) {
      console.error('Failed to create config:', e)
    }
  }

  if (!config || !configPath) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b border-border/40 px-4 py-2 flex items-center gap-2">
          <span className="ao-heading">Configs</span>
          <span className="text-[11px] text-muted-foreground/60 font-mono flex-1 truncate">{workspacePath}</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />}
          <div className="flex gap-1">
            <button
              className="ao-btn-secondary"
              onClick={() => handleNewConfig('pipeline')}
            >
              <Plus className="h-3 w-3" /> Pipeline
            </button>
            <button
              className="ao-btn-secondary"
              onClick={() => handleNewConfig('orchestrator')}
            >
              <Plus className="h-3 w-3" /> Orchestrator
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-4 space-y-2 max-w-xl">
            {workspaceConfigs.length === 0 ? (
              <p className="text-[13px] text-muted-foreground/60">No YAML configs found in workspace. Create one above.</p>
            ) : (
              workspaceConfigs.map((p) => (
                <div
                  key={p}
                  className="ao-card cursor-pointer hover:bg-foreground/[0.02] active:scale-[0.98] active:opacity-80 transition-colors duration-100"
                  onClick={() => handleSelectConfig(p)}
                >
                  <div className="py-3 px-4 flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                    <span className="text-[13px] font-mono flex-1 text-foreground/80">
                      {p.replace(workspacePath + '/', '')}
                    </span>
                    <span className="ao-badge border border-border/60 text-muted-foreground/60">
                      {p.includes('orchestrat') ? 'orch' : 'pipe'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  const handleBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard?')) return
    clearConfig()
  }

  const handleRun = () => {
    useStore.getState().setPage('execution')
  }

  const toolbar = (
    <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
      <button
        className="ao-btn-ghost"
        onClick={handleBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Configs
      </button>
      <div className="ml-1" />
      <button
        className="ao-btn-primary disabled:opacity-40 disabled:pointer-events-none"
        onClick={handleSave}
        disabled={!dirty || saveStatus === 'saving'}
      >
        {saveStatus === 'saving' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        Save
      </button>
      {saveStatus === 'saved' && <span className="ao-badge bg-foreground/[0.06] text-muted-foreground">Saved</span>}
      {saveStatus === 'error' && <span className="ao-badge bg-destructive/10 text-destructive">Save failed</span>}
      <span className="text-[11px] text-muted-foreground/60 font-mono flex-1 truncate">
        {configPath.replace(workspacePath + '/', '')}
      </span>
      <span className="ao-badge border border-border/60 text-muted-foreground/60">
        {config.orchestrator ? 'orchestrator' : 'pipeline'}
      </span>
      <div className="ml-1" />
      <div className="flex bg-foreground/[0.04] rounded-md p-0.5">
        <button
          className={`h-6 px-2 text-[11px] rounded-[5px] inline-flex items-center gap-1 transition-colors duration-100 ${
            editMode === 'form' ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            if (editMode === 'yaml') {
              // Apply YAML changes before switching
              try {
                const parsed = yaml.load(yamlText) as Config
                if (parsed) {
                  updateConfig(parsed)
                  setYamlError(null)
                }
              } catch (e: any) {
                setYamlError(e.message)
                return
              }
            }
            setEditMode('form')
          }}
        >
          <FormInput className="h-3 w-3" /> Form
        </button>
        <button
          className={`h-6 px-2 text-[11px] rounded-[5px] inline-flex items-center gap-1 transition-colors duration-100 ${
            editMode === 'yaml' ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            setYamlText(yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true }))
            setYamlError(null)
            setEditMode('yaml')
          }}
        >
          <Code className="h-3 w-3" /> YAML
        </button>
      </div>
      <button
        className="ao-btn-primary bg-green-600/90 text-white hover:bg-green-600"
        onClick={handleRun}
      >
        <Play className="h-3 w-3" /> Run
      </button>
    </div>
  )

  // YAML editor mode
  if (editMode === 'yaml') {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <YamlEditor
          value={yamlText}
          error={yamlError}
          onChange={(text) => {
            setYamlText(text)
            setYamlError(null)
            try {
              const parsed = yaml.load(text) as Config
              if (parsed) {
                updateConfig(parsed)
              }
            } catch {
              // Don't update config on parse error — user is still typing
            }
          }}
          onError={setYamlError}
        />
      </div>
    )
  }

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
    <div className="flex flex-1 flex-col">
      {toolbar}
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-[13px]">
        Unknown config format — switch to YAML mode to edit
      </div>
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

  const moveStep = (from: number, to: number) => {
    const steps = [...pipe.steps]
    const [item] = steps.splice(from, 1)
    steps.splice(to, 0, item)
    updatePipe({ steps })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6 max-w-3xl">
        {/* General */}
        <section className="space-y-3">
          <h2 className="ao-heading">General</h2>
          <div className="space-y-1">
            <label className="ao-label">Name</label>
            <input
              className="ao-input"
              value={pipe.name}
              onChange={(e) => updatePipe({ name: e.target.value })}
            />
          </div>
        </section>

        <div className="mt-4" />

        {/* Defaults */}
        <section className="space-y-3">
          <h2 className="ao-heading">Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="ao-label">Command</label>
              <input
                className="ao-input"
                value={pipe.defaults?.command || ''}
                onChange={(e) => updateDefaults({ command: e.target.value })}
                placeholder="claude"
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Timeout</label>
              <input
                className="ao-input"
                value={pipe.defaults?.timeout || ''}
                onChange={(e) => updateDefaults({ timeout: e.target.value })}
                placeholder="30m"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="ao-label">Args (comma-separated)</label>
            <input
              className="ao-input"
              value={(pipe.defaults?.args || []).join(', ')}
              onChange={(e) =>
                updateDefaults({ args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="--dangerously-skip-permissions, -p"
            />
          </div>
        </section>

        <div className="mt-4" />

        {/* Loop */}
        <section className="space-y-3">
          <h2 className="ao-heading">Loop</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="ao-label">Count (0 = infinite)</label>
              <input
                type="number"
                className="ao-input"
                value={pipe.loop?.count ?? 0}
                onChange={(e) => updatePipe({ loop: { ...pipe.loop, count: parseInt(e.target.value) || 0 } })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Delay between iterations</label>
              <input
                className="ao-input"
                value={pipe.loop?.delay || ''}
                onChange={(e) => updatePipe({ loop: { ...pipe.loop, delay: e.target.value } })}
                placeholder="5s"
              />
            </div>
          </div>
        </section>

        <div className="mt-4" />

        {/* SSH */}
        {pipe.defaults?.ssh && (
          <>
            <SSHSection
              ssh={pipe.defaults.ssh}
              onChange={(ssh) => updateDefaults({ ssh })}
            />
            <div className="mt-4" />
          </>
        )}

        {!pipe.defaults?.ssh && (
          <>
            <button
              className="ao-btn-secondary"
              onClick={() => updateDefaults({ ssh: { host: '', user: '' } })}
            >
              <Plus className="h-3.5 w-3.5" /> Add SSH Remote Execution
            </button>
            <div className="mt-4" />
          </>
        )}

        {/* Steps */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="ao-heading">Steps ({pipe.steps.length})</h2>
            <div className="flex gap-2">
              <button
                className="ao-btn-secondary"
                onClick={() => addStep('agent')}
              >
                <Plus className="h-3 w-3" /> Agent Step
              </button>
              <button
                className="ao-btn-secondary"
                onClick={() => addStep('action')}
              >
                <Plus className="h-3 w-3" /> Action
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {pipe.steps.map((step, i) => (
              <StepForm key={i} step={step} index={i} total={pipe.steps.length} onChange={updateStep} onRemove={removeStep} onMove={moveStep} />
            ))}
          </div>
        </section>
      </div>
    </div>
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
        <h2 className="ao-heading">SSH Remote Execution</h2>
        <button
          className="ao-btn-ghost text-destructive/80 hover:text-destructive"
          onClick={() => onChange(undefined)}
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="ao-label">Host</label>
          <input
            className="ao-input"
            value={ssh.host || ''}
            onChange={(e) => onChange({ ...ssh, host: e.target.value })}
            placeholder="192.168.1.100"
          />
        </div>
        <div className="space-y-1">
          <label className="ao-label">User</label>
          <input
            className="ao-input"
            value={ssh.user || ''}
            onChange={(e) => onChange({ ...ssh, user: e.target.value })}
            placeholder="deploy"
          />
        </div>
        <div className="space-y-1">
          <label className="ao-label">Port</label>
          <input
            type="number"
            className="ao-input"
            value={ssh.port || 22}
            onChange={(e) => onChange({ ...ssh, port: parseInt(e.target.value) || 22 })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="ao-label">Key File</label>
        <input
          className="ao-input"
          value={ssh.key_file || ''}
          onChange={(e) => onChange({ ...ssh, key_file: e.target.value })}
          placeholder="~/.ssh/id_ed25519 (auto-detected if empty)"
        />
      </div>
      {/* tmux */}
      <div className="rounded-md border border-border/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="ao-heading">tmux</p>
          {!ssh.tmux ? (
            <button
              className="ao-btn-secondary"
              onClick={() => onChange({ ...ssh, tmux: { session: '', ttl: '72h' } })}
            >
              Enable
            </button>
          ) : (
            <button
              className="ao-btn-ghost text-[11px] text-destructive/80 hover:text-destructive"
              onClick={() => onChange({ ...ssh, tmux: undefined })}
            >
              Disable
            </button>
          )}
        </div>
        {ssh.tmux && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="ao-label">Session Name</label>
              <input
                className="ao-input"
                value={ssh.tmux.session || ''}
                onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, session: e.target.value } })}
                placeholder="auto from step name"
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">TTL</label>
              <input
                className="ao-input"
                value={ssh.tmux.ttl || '72h'}
                onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, ttl: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Log Dir</label>
              <input
                className="ao-input"
                value={ssh.tmux.log_dir || ''}
                onChange={(e) => onChange({ ...ssh, tmux: { ...ssh.tmux, log_dir: e.target.value } })}
                placeholder="/tmp/agent-orchestra"
              />
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
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6 max-w-3xl">
        <section className="space-y-3">
          <h2 className="ao-heading">General</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="ao-label">Name</label>
              <input
                className="ao-input"
                value={orch.name}
                onChange={(e) => updateOrch({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Project Root</label>
              <input
                className="ao-input"
                value={orch.project_root || '.'}
                onChange={(e) => updateOrch({ project_root: e.target.value })}
              />
            </div>
          </div>
        </section>

        <div className="mt-4" />

        <section className="space-y-3">
          <h2 className="ao-heading">Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="ao-label">Command</label>
              <input
                className="ao-input"
                value={orch.defaults?.command || ''}
                onChange={(e) => updateOrch({ defaults: { ...orch.defaults, command: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Timeout</label>
              <input
                className="ao-input"
                value={orch.defaults?.timeout || ''}
                onChange={(e) => updateOrch({ defaults: { ...orch.defaults, timeout: e.target.value } })}
                placeholder="30m"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="ao-label">Args (comma-separated)</label>
            <input
              className="ao-input"
              value={(orch.defaults?.args || []).join(', ')}
              onChange={(e) => updateOrch({ defaults: { ...orch.defaults, args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
            />
          </div>
        </section>

        <div className="mt-4" />

        {/* SSH for orchestrator defaults */}
        {orch.defaults?.ssh ? (
          <>
            <SSHSection
              ssh={orch.defaults.ssh}
              onChange={(ssh) => updateOrch({ defaults: { ...orch.defaults, ssh } })}
            />
            <div className="mt-4" />
          </>
        ) : (
          <>
            <button
              className="ao-btn-secondary"
              onClick={() => updateOrch({ defaults: { ...orch.defaults, ssh: { host: '', user: '' } } })}
            >
              <Plus className="h-3.5 w-3.5" /> Add SSH Remote Execution
            </button>
            <div className="mt-4" />
          </>
        )}

        <section className="space-y-3">
          <h2 className="ao-heading">Runtime</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="ao-label">Max Concurrency</label>
              <input
                type="number"
                className="ao-input"
                value={orch.concurrency?.max || 1}
                onChange={(e) => updateOrch({ concurrency: { max: parseInt(e.target.value) || 1 } })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">Log Directory</label>
              <input
                className="ao-input"
                value={orch.logging?.dir || './logs'}
                onChange={(e) => updateOrch({ logging: { ...orch.logging!, dir: e.target.value, per_task: orch.logging?.per_task ?? true } })}
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">State File</label>
              <input
                className="ao-input"
                value={orch.persistence?.file || ''}
                onChange={(e) => updateOrch({ persistence: { file: e.target.value } })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={orch.logging?.per_task ?? true}
              onClick={() => updateOrch({ logging: { dir: orch.logging?.dir || './logs', per_task: !(orch.logging?.per_task ?? true) } })}
              className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${
                (orch.logging?.per_task ?? true) ? 'bg-foreground/80' : 'bg-foreground/10'
              }`}
            >
              <span
                className={`pointer-events-none block h-[14px] w-[14px] rounded-full bg-background shadow-sm transition-transform duration-150 translate-y-[2px] ${
                  (orch.logging?.per_task ?? true) ? 'translate-x-[16px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
            <label className="ao-label">Per-task logging</label>
          </div>
        </section>

        <div className="mt-4" />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="ao-heading">Triggers ({orch.triggers.length})</h2>
            <button
              className="ao-btn-secondary"
              onClick={addTrigger}
            >
              <Plus className="h-3.5 w-3.5" /> Add Trigger
            </button>
          </div>
          <div className="space-y-4">
            {orch.triggers.map((trigger, i) => (
              <TriggerForm key={i} trigger={trigger} index={i} pipelineNames={pipelineNames} onChange={updateTrigger} onRemove={removeTrigger} />
            ))}
          </div>
        </section>

        <div className="mt-4" />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="ao-heading">Pipelines ({Object.keys(orch.pipelines).length})</h2>
            <button
              className="ao-btn-secondary"
              onClick={addPipeline}
            >
              <Plus className="h-3.5 w-3.5" /> Add Pipeline
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(orch.pipelines).map(([name, pipeline]) => (
              <PipelineForm key={name} name={name} pipeline={pipeline} onChange={updatePipeline} onRemove={removePipeline} onRename={renamePipeline} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── YAML Editor ──────────────────────────────────────────────────

function YamlEditor({
  value,
  error,
  onChange,
  onError
}: {
  value: string
  error: string | null
  onChange: (text: string) => void
  onError: (err: string | null) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleChange = (text: string) => {
    onChange(text)
    try {
      yaml.load(text)
      onError(null)
    } catch (e: any) {
      onError(e.message)
    }
  }

  const lineCount = value.split('\n').length

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-border/40 text-destructive text-[11px] font-mono">
          {error}
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-auto bg-[hsl(var(--terminal-bg))]">
        <div className="py-4 pl-4 pr-2 text-right select-none text-muted-foreground/30 text-[11px] font-mono leading-relaxed shrink-0">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent text-[hsl(var(--terminal-fg))] text-[11px] font-mono leading-relaxed p-4 pl-2 resize-none outline-none border-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  )
}
