import { Trash2 } from 'lucide-react'
import type { TriggerConfig } from '../../types/config'

interface TriggerFormProps {
  trigger: TriggerConfig
  index: number
  pipelineNames: string[]
  onChange: (index: number, trigger: TriggerConfig) => void
  onRemove: (index: number) => void
}

export function TriggerForm({ trigger, index, pipelineNames, onChange, onRemove }: TriggerFormProps) {
  const update = (patch: Partial<TriggerConfig>) => {
    onChange(index, { ...trigger, ...patch })
  }

  const updateGitlab = (patch: Partial<TriggerConfig['gitlab']>) => {
    onChange(index, { ...trigger, gitlab: { ...trigger.gitlab, ...patch } })
  }

  return (
    <div className="ao-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <span className="ao-heading">
          {trigger.name || `Trigger ${index + 1}`}
        </span>
        <button
          className="ao-btn-icon hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="ao-label">Name</label>
            <input
              className="ao-input"
              value={trigger.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="ao-label">Type</label>
            <select
              className="ao-input px-2"
              value={trigger.type}
              onChange={(e) => update({ type: e.target.value as TriggerConfig['type'] })}
            >
              <option value="gitlab-issues">gitlab-issues</option>
              <option value="gitlab-ci">gitlab-ci</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="ao-label">Poll Interval</label>
            <input
              className="ao-input"
              value={trigger.poll_interval}
              onChange={(e) => update({ poll_interval: e.target.value })}
              placeholder="4h"
            />
          </div>
          <div className="space-y-1">
            <label className="ao-label">Priority</label>
            <input
              type="number"
              className="ao-input"
              value={trigger.priority}
              onChange={(e) => update({ priority: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1">
            <label className="ao-label">Pipeline</label>
            <select
              className="ao-input px-2"
              value={trigger.pipeline}
              onChange={(e) => update({ pipeline: e.target.value })}
            >
              {pipelineNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border/40 p-3">
          <p className="ao-label">GitLab</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="ao-label">Project</label>
              <input
                className="ao-input"
                value={trigger.gitlab.project}
                onChange={(e) => updateGitlab({ project: e.target.value })}
                placeholder="mygroup/myproject"
              />
            </div>
            <div className="space-y-1">
              <label className="ao-label">URL</label>
              <input
                className="ao-input"
                value={trigger.gitlab.url || ''}
                onChange={(e) => updateGitlab({ url: e.target.value })}
                placeholder="https://gitlab.example.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="ao-label">Labels (comma-separated)</label>
            <input
              className="ao-input"
              value={(trigger.gitlab.labels || []).join(', ')}
              onChange={(e) =>
                updateGitlab({ labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="ai:todo, ai:scheduled"
            />
          </div>
          {trigger.type === 'gitlab-ci' && (
            <>
              <div className="space-y-1">
                <label className="ao-label">Username</label>
                <input
                  className="ao-input"
                  value={trigger.gitlab.username || ''}
                  onChange={(e) => updateGitlab({ username: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="ao-label">Watch Jobs (comma-separated globs)</label>
                <input
                  className="ao-input"
                  value={(trigger.gitlab.watch_jobs || []).join(', ')}
                  onChange={(e) =>
                    updateGitlab({ watch_jobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                  }
                  placeholder="ginkgo*, unit-tests"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
