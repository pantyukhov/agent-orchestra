import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Trash2, GripVertical } from 'lucide-react'
import type { StepConfig } from '../../types/config'

interface StepFormProps {
  step: StepConfig
  index: number
  onChange: (index: number, step: StepConfig) => void
  onRemove: (index: number) => void
}

export function StepForm({ step, index, onChange, onRemove }: StepFormProps) {
  const update = (patch: Partial<StepConfig>) => {
    onChange(index, { ...step, ...patch })
  }

  const isAction = !!step.action
  const isGroup = !!step.group

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        <CardTitle className="text-sm flex-1">
          {step.action ? `Action: ${step.action}` : step.group ? `Group: ${step.group}` : step.name || `Step ${index + 1}`}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(index)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAction ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Action</Label>
                <Select value={step.action} onValueChange={(v) => update({ action: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="git-save">git-save</SelectItem>
                    <SelectItem value="git-checkout">git-checkout</SelectItem>
                    <SelectItem value="gitlab-comment">gitlab-comment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {step.action === 'git-checkout' && (
                <div className="space-y-1">
                  <Label>Branch</Label>
                  <Input value={step.branch || ''} onChange={(e) => update({ branch: e.target.value })} />
                </div>
              )}
            </div>
            {step.action === 'git-checkout' && (
              <div className="space-y-1">
                <Label>Create From</Label>
                <Input value={step.create_from || ''} onChange={(e) => update({ create_from: e.target.value })} placeholder="origin/master" />
              </div>
            )}
            {step.action === 'git-save' && (
              <div className="space-y-1">
                <Label>Message</Label>
                <Input value={step.message || ''} onChange={(e) => update({ message: e.target.value })} />
              </div>
            )}
            {step.action === 'gitlab-comment' && (
              <>
                <div className="space-y-1">
                  <Label>Issue IID</Label>
                  <Input value={step.issue || ''} onChange={(e) => update({ issue: e.target.value })} placeholder={'{{ .issue_iid }}'} />
                </div>
                <div className="space-y-1">
                  <Label>Body</Label>
                  <Textarea value={step.body || ''} onChange={(e) => update({ body: e.target.value })} rows={3} />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={step.name || ''} onChange={(e) => update({ name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Timeout</Label>
                <Input value={step.timeout || ''} onChange={(e) => update({ timeout: e.target.value })} placeholder="30m" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Prompt</Label>
              <Textarea
                value={step.prompt || ''}
                onChange={(e) => update({ prompt: e.target.value })}
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>On Error</Label>
                <Select value={step.on_error || 'stop'} onValueChange={(v) => update({ on_error: v as StepConfig['on_error'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop">stop</SelectItem>
                    <SelectItem value="continue">continue</SelectItem>
                    <SelectItem value="retry">retry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {step.on_error === 'retry' && (
                <>
                  <div className="space-y-1">
                    <Label>Retry Count</Label>
                    <Input
                      type="number"
                      value={step.retry_count || 1}
                      onChange={(e) => update({ retry_count: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Retry Delay</Label>
                    <Input value={step.retry_delay || ''} onChange={(e) => update({ retry_delay: e.target.value })} placeholder="30s" />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={step.capture_output || false}
                onCheckedChange={(v) => update({ capture_output: v })}
              />
              <Label>Capture Output</Label>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
