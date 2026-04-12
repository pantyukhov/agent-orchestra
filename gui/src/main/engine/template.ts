import type { StepConfig } from './types'

/**
 * Renders Go-style {{ .field }} templates in a string.
 * Supports dot-path access: {{ .steps.name.output }}
 * Supports stepOutput helper: {{ stepOutput .steps "name" }}
 */
export function renderString(s: string, data: Record<string, any>): string {
  if (!s || !s.includes('{{')) return s
  return s.replace(/\{\{\s*(.+?)\s*\}\}/g, (_match, expr: string) => {
    // stepOutput .steps "name"
    const stepOutputMatch = expr.match(/^stepOutput\s+\.(\w+)\s+"([^"]+)"$/)
    if (stepOutputMatch) {
      const [, mapKey, stepName] = stepOutputMatch
      const m = data[mapKey]
      return m?.[stepName]?.output ?? ''
    }

    // .field.subfield...
    if (expr.startsWith('.')) {
      const path = expr.slice(1).split('.')
      let val: any = data
      for (const key of path) {
        if (val == null) return ''
        val = val[key]
      }
      return val != null ? String(val) : ''
    }

    return ''
  })
}

/**
 * Renders all template-able fields in a step.
 */
export function renderStep(step: StepConfig, data: Record<string, any>): StepConfig {
  const r = (s?: string) => (s ? renderString(s, data) : s)
  const rendered: StepConfig = { ...step }
  rendered.prompt = r(step.prompt)
  rendered.branch = r(step.branch)
  rendered.create_from = r(step.create_from)
  rendered.message = r(step.message)
  rendered.issue = r(step.issue)
  rendered.body = r(step.body)
  if (step.args) rendered.args = step.args.map((a) => renderString(a, data))
  if (step.steps) rendered.steps = step.steps.map((s) => renderStep(s, data))
  return rendered
}

/**
 * Pre-populate step entries so templates can reference them before execution.
 */
export function ensureStepEntries(data: Record<string, any>, steps: StepConfig[]) {
  if (!data.steps) data.steps = {}
  for (const s of steps) {
    if (s.name && !data.steps[s.name]) {
      data.steps[s.name] = { output: '', exit_code: '' }
    }
    if (s.steps) ensureStepEntries(data, s.steps)
  }
}
