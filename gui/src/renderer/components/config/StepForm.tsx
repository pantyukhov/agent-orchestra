import { Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import type { StepConfig } from '../../types/config'

interface StepFormProps {
  step: StepConfig
  index: number
  total?: number
  onChange: (index: number, step: StepConfig) => void
  onRemove: (index: number) => void
  onMove?: (from: number, to: number) => void
}

export function StepForm({ step, index, total = 0, onChange, onRemove, onMove }: StepFormProps) {
  const update = (patch: Partial<StepConfig>) => {
    onChange(index, { ...step, ...patch })
  }

  const isAction = !!step.action

  return (
    <div className="ao-card">
      <div className="flex items-center gap-1 px-4 py-3 border-b border-border/40">
        {onMove && (
          <div className="flex flex-col -my-1">
            <button
              className="ao-btn-icon p-0.5 disabled:opacity-30 disabled:pointer-events-none"
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              className="ao-btn-icon p-0.5 disabled:opacity-30 disabled:pointer-events-none"
              disabled={index >= total - 1}
              onClick={() => onMove(index, index + 1)}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        )}
        <span className="ao-heading flex-1 ml-1">
          <span className="text-muted-foreground/60 text-[11px] mr-1">{index + 1}.</span>
          {step.action ? `Action: ${step.action}` : step.group ? `Group: ${step.group}` : step.name || `Step ${index + 1}`}
        </span>
        <button
          className="ao-btn-icon hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {isAction ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="ao-label">Action</label>
                <select
                  className="ao-input px-2"
                  value={step.action}
                  onChange={(e) => update({ action: e.target.value })}
                >
                  <option value="git-save">git-save</option>
                  <option value="git-checkout">git-checkout</option>
                  <option value="gitlab-comment">gitlab-comment</option>
                </select>
              </div>
              {step.action === 'git-checkout' && (
                <div className="space-y-1">
                  <label className="ao-label">Branch</label>
                  <input
                    className="ao-input"
                    value={step.branch || ''}
                    onChange={(e) => update({ branch: e.target.value })}
                  />
                </div>
              )}
            </div>
            {step.action === 'git-checkout' && (
              <div className="space-y-1">
                <label className="ao-label">Create From</label>
                <input
                  className="ao-input"
                  value={step.create_from || ''}
                  onChange={(e) => update({ create_from: e.target.value })}
                  placeholder="origin/master"
                />
              </div>
            )}
            {step.action === 'git-save' && (
              <div className="space-y-1">
                <label className="ao-label">Message</label>
                <input
                  className="ao-input"
                  value={step.message || ''}
                  onChange={(e) => update({ message: e.target.value })}
                />
              </div>
            )}
            {step.action === 'gitlab-comment' && (
              <>
                <div className="space-y-1">
                  <label className="ao-label">Issue IID</label>
                  <input
                    className="ao-input"
                    value={step.issue || ''}
                    onChange={(e) => update({ issue: e.target.value })}
                    placeholder={'{{ .issue_iid }}'}
                  />
                </div>
                <div className="space-y-1">
                  <label className="ao-label">Body</label>
                  <textarea
                    className="ao-input min-h-[72px] h-auto py-2 resize-none font-mono"
                    value={step.body || ''}
                    onChange={(e) => update({ body: e.target.value })}
                    rows={3}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="ao-label">Name</label>
                <input
                  className="ao-input"
                  value={step.name || ''}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="ao-label">Timeout</label>
                <input
                  className="ao-input"
                  value={step.timeout || ''}
                  onChange={(e) => update({ timeout: e.target.value })}
                  placeholder="30m"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="ao-label">Prompt</label>
              <textarea
                className="ao-input min-h-[72px] h-auto py-2 resize-none font-mono"
                value={step.prompt || ''}
                onChange={(e) => update({ prompt: e.target.value })}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="ao-label">On Error</label>
                <select
                  className="ao-input px-2"
                  value={step.on_error || 'stop'}
                  onChange={(e) => update({ on_error: e.target.value as StepConfig['on_error'] })}
                >
                  <option value="stop">stop</option>
                  <option value="continue">continue</option>
                  <option value="retry">retry</option>
                </select>
              </div>
              {step.on_error === 'retry' && (
                <>
                  <div className="space-y-1">
                    <label className="ao-label">Retry Count</label>
                    <input
                      type="number"
                      className="ao-input"
                      value={step.retry_count || 1}
                      onChange={(e) => update({ retry_count: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="ao-label">Retry Delay</label>
                    <input
                      className="ao-input"
                      value={step.retry_delay || ''}
                      onChange={(e) => update({ retry_delay: e.target.value })}
                      placeholder="30s"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={step.capture_output || false}
                onClick={() => update({ capture_output: !step.capture_output })}
                className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${
                  step.capture_output ? 'bg-foreground/80' : 'bg-foreground/10'
                }`}
              >
                <span
                  className={`pointer-events-none block h-[14px] w-[14px] rounded-full bg-background shadow-sm transition-transform duration-150 translate-y-[2px] ${
                    step.capture_output ? 'translate-x-[16px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
              <label className="ao-label">Capture Output</label>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
