import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { StepForm } from './StepForm'
import type { PipelineDef, StepConfig, StateTransition } from '../../types/config'

interface PipelineFormProps {
  name: string
  pipeline: PipelineDef
  onChange: (name: string, pipeline: PipelineDef) => void
  onRemove: (name: string) => void
  onRename: (oldName: string, newName: string) => void
}

function TransitionFields({
  label,
  transition,
  onChange
}: {
  label: string
  transition?: StateTransition
  onChange: (t: StateTransition) => void
}) {
  const t = transition || {}
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground/80">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground/60">Remove Labels</label>
          <input
            className="w-full h-8 px-2.5 text-[13px] rounded-md border border-border/60 bg-transparent outline-none focus:border-foreground/20 focus:ring-1 focus:ring-foreground/10 transition-all duration-100 placeholder:text-muted-foreground/40"
            value={(t.remove_labels || []).join(', ')}
            onChange={(e) =>
              onChange({ ...t, remove_labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground/60">Add Labels</label>
          <input
            className="w-full h-8 px-2.5 text-[13px] rounded-md border border-border/60 bg-transparent outline-none focus:border-foreground/20 focus:ring-1 focus:ring-foreground/10 transition-all duration-100 placeholder:text-muted-foreground/40"
            value={(t.add_labels || []).join(', ')}
            onChange={(e) =>
              onChange({ ...t, add_labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      </div>
    </div>
  )
}

export function PipelineForm({ name, pipeline, onChange, onRemove, onRename }: PipelineFormProps) {
  const [expanded, setExpanded] = useState(true)
  const [editName, setEditName] = useState(name)

  const updateState = (key: string, transition: StateTransition) => {
    onChange(name, {
      ...pipeline,
      state: { ...pipeline.state, [key]: transition }
    })
  }

  const updateStep = (index: number, step: StepConfig) => {
    const steps = [...pipeline.steps]
    steps[index] = step
    onChange(name, { ...pipeline, steps })
  }

  const removeStep = (index: number) => {
    onChange(name, { ...pipeline, steps: pipeline.steps.filter((_, i) => i !== index) })
  }

  const moveStep = (from: number, to: number) => {
    const steps = [...pipeline.steps]
    const [item] = steps.splice(from, 1)
    steps.splice(to, 0, item)
    onChange(name, { ...pipeline, steps })
  }

  const addStep = (type: 'agent' | 'action') => {
    const newStep: StepConfig =
      type === 'action'
        ? { action: 'git-save' }
        : { name: `step-${pipeline.steps.length + 1}`, prompt: '' }
    onChange(name, { ...pipeline, steps: [...pipeline.steps, newStep] })
  }

  return (
    <div className="rounded-lg border border-border/40">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer border-b border-border/40 hover:bg-foreground/[0.02] transition-colors duration-100"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-[13px] font-medium text-foreground/80 flex-1">{name}</span>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-foreground/[0.04] transition-colors duration-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(name)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-4">
          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground/80">Pipeline Name</label>
            <div className="flex gap-2">
              <input
                className="w-full h-8 px-2.5 text-[13px] rounded-md border border-border/60 bg-transparent outline-none focus:border-foreground/20 focus:ring-1 focus:ring-foreground/10 transition-all duration-100 placeholder:text-muted-foreground/40"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              {editName !== name && (
                <button
                  className="px-2.5 py-1 text-[12px] rounded-md border border-border/60 text-foreground bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors duration-100"
                  onClick={() => { onRename(name, editName) }}
                >
                  Rename
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground/80">Stop Labels (comma-separated)</label>
            <input
              className="w-full h-8 px-2.5 text-[13px] rounded-md border border-border/60 bg-transparent outline-none focus:border-foreground/20 focus:ring-1 focus:ring-foreground/10 transition-all duration-100 placeholder:text-muted-foreground/40"
              value={(pipeline.stop_labels || []).join(', ')}
              onChange={(e) =>
                onChange(name, {
                  ...pipeline,
                  stop_labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                })
              }
            />
          </div>

          <div className="h-px bg-border/40" />
          <p className="text-[13px] font-medium text-foreground/80">State Transitions</p>
          <div className="space-y-3">
            <TransitionFields label="On Start" transition={pipeline.state?.on_start} onChange={(t) => updateState('on_start', t)} />
            <TransitionFields label="On Success" transition={pipeline.state?.on_success} onChange={(t) => updateState('on_success', t)} />
            <TransitionFields label="On Failure" transition={pipeline.state?.on_failure} onChange={(t) => updateState('on_failure', t)} />
            <TransitionFields label="On Needs Human" transition={pipeline.state?.on_needs_human} onChange={(t) => updateState('on_needs_human', t)} />
          </div>

          <div className="h-px bg-border/40" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-foreground/80">Steps ({pipeline.steps.length})</p>
            <div className="flex gap-2">
              <button
                className="px-2.5 py-1 text-[12px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1"
                onClick={() => addStep('agent')}
              >
                <Plus className="h-3 w-3" /> Agent Step
              </button>
              <button
                className="px-2.5 py-1 text-[12px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-100 inline-flex items-center gap-1"
                onClick={() => addStep('action')}
              >
                <Plus className="h-3 w-3" /> Action
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {pipeline.steps.map((step, i) => (
              <StepForm key={i} step={step} index={i} total={pipeline.steps.length} onChange={updateStep} onRemove={removeStep} onMove={moveStep} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
