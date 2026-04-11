import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
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
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          {trigger.name || `Trigger ${index + 1}`}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={trigger.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={trigger.type} onValueChange={(v) => update({ type: v as TriggerConfig['type'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gitlab-issues">gitlab-issues</SelectItem>
                <SelectItem value="gitlab-ci">gitlab-ci</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Poll Interval</Label>
            <Input
              value={trigger.poll_interval}
              onChange={(e) => update({ poll_interval: e.target.value })}
              placeholder="4h"
            />
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Input
              type="number"
              value={trigger.priority}
              onChange={(e) => update({ priority: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Pipeline</Label>
            <Select value={trigger.pipeline} onValueChange={(v) => update({ pipeline: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {pipelineNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium text-muted-foreground">GitLab</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Project</Label>
              <Input
                value={trigger.gitlab.project}
                onChange={(e) => updateGitlab({ project: e.target.value })}
                placeholder="mygroup/myproject"
              />
            </div>
            <div className="space-y-1">
              <Label>URL</Label>
              <Input
                value={trigger.gitlab.url || ''}
                onChange={(e) => updateGitlab({ url: e.target.value })}
                placeholder="https://gitlab.example.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Labels (comma-separated)</Label>
            <Input
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
                <Label>Username</Label>
                <Input
                  value={trigger.gitlab.username || ''}
                  onChange={(e) => updateGitlab({ username: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Watch Jobs (comma-separated globs)</Label>
                <Input
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
      </CardContent>
    </Card>
  )
}
