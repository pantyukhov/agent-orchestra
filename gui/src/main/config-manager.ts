import { readFileSync, writeFileSync } from 'fs'
import yaml from 'js-yaml'
import type { Config } from '../renderer/types/config'

export function loadConfig(filePath: string): Config {
  const raw = readFileSync(filePath, 'utf-8')
  return yaml.load(raw) as Config
}

export function saveConfig(filePath: string, config: Config): void {
  const cleaned = stripEmpty(config)
  const content = yaml.dump(cleaned, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    flowLevel: -1
  })
  // Convert simple string arrays to flow style: ["a", "b"]
  const formatted = content.replace(
    /^(\s+(?:args|labels|watch_jobs|remove_labels|add_labels|stop_labels):)\n((?:\s+-\s+.+\n)+)/gm,
    (_match, key: string, items: string) => {
      const values = items
        .trim()
        .split('\n')
        .map((line: string) => line.replace(/^\s*-\s*/, '').trim())
      return `${key} [${values.map((v: string) => `"${v}"`).join(', ')}]\n`
    }
  )
  writeFileSync(filePath, formatted, 'utf-8')
}

export function createDefaultConfig(mode: 'pipeline' | 'orchestrator'): Config {
  if (mode === 'pipeline') {
    return {
      pipeline: {
        name: 'my-pipeline',
        defaults: {
          command: 'claude',
          args: ['--dangerously-skip-permissions', '-p'],
          timeout: '30m'
        },
        steps: [{ name: 'step-1', prompt: 'Hello' }]
      }
    }
  }
  return {
    orchestrator: {
      name: 'my-orchestrator',
      project_root: '.',
      defaults: {
        command: 'claude',
        args: ['--dangerously-skip-permissions', '-p'],
        timeout: '30m'
      },
      concurrency: { max: 1 },
      logging: { dir: './logs', per_task: true },
      persistence: { file: '.agent-orchestra.state.json' },
      triggers: [
        {
          name: 'my-trigger',
          type: 'gitlab-issues',
          gitlab: { project: 'mygroup/myproject', labels: ['ai:todo'] },
          poll_interval: '2m',
          priority: 1,
          pipeline: 'my-pipeline'
        }
      ],
      pipelines: {
        'my-pipeline': {
          state: {
            on_start: { remove_labels: ['ai:todo'], add_labels: ['ai:in-progress'] },
            on_success: { remove_labels: ['ai:in-progress'], add_labels: ['ai:done'] },
            on_failure: { remove_labels: ['ai:in-progress'], add_labels: ['ai:failed'] }
          },
          steps: [{ name: 'step-1', prompt: 'Implement the task' }]
        }
      }
    }
  }
}

function stripEmpty(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    const filtered = obj.map(stripEmpty).filter((v) => v !== undefined)
    return filtered.length > 0 ? filtered : undefined
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = stripEmpty(value)
      if (cleaned !== undefined) {
        result[key] = cleaned
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
  if (obj === '' || obj === null || obj === undefined) return undefined
  return obj
}
