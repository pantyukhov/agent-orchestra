import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'

let app: ElectronApplication
let page: Page

const testWorkspace = path.resolve(__dirname, '../test-workspace')

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.resolve(__dirname, '../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  await app.close()
})

test.describe('Pipeline Config Editor', () => {
  test('pipeline config has correct fields', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    // Verify pipeline structure
    expect(config.pipeline).toBeDefined()
    expect(config.pipeline.name).toBe('test-pipeline')
    expect(config.pipeline.defaults).toBeDefined()
    expect(config.pipeline.defaults.command).toBe('echo')
    expect(config.pipeline.defaults.args).toEqual(['hello'])
    expect(config.pipeline.defaults.timeout).toBe('5m')
    expect(config.pipeline.steps).toHaveLength(2)
    expect(config.pipeline.steps[0].name).toBe('step-1')
    expect(config.pipeline.steps[0].prompt).toBe('Hello world')
    expect(config.pipeline.steps[1].name).toBe('step-2')
  })

  test('can modify pipeline steps and save', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    // Add a new step
    config.pipeline.steps.push({
      name: 'step-3',
      prompt: 'Third step added by test'
    })

    // Save
    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    // Reload and verify
    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.pipeline.steps).toHaveLength(3)
    expect(reloaded.pipeline.steps[2].name).toBe('step-3')
    expect(reloaded.pipeline.steps[2].prompt).toBe('Third step added by test')

    // Restore
    writeFileSync(configPath, original, 'utf-8')
  })

  test('can add SSH config to pipeline', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    // Add SSH
    config.pipeline.defaults.ssh = {
      host: '192.168.1.100',
      user: 'deploy',
      port: 22,
      tmux: {
        session: 'test-session',
        ttl: '48h',
        log_dir: '/tmp/test-logs'
      }
    }

    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.pipeline.defaults.ssh).toBeDefined()
    expect(reloaded.pipeline.defaults.ssh.host).toBe('192.168.1.100')
    expect(reloaded.pipeline.defaults.ssh.tmux.session).toBe('test-session')
    expect(reloaded.pipeline.defaults.ssh.tmux.ttl).toBe('48h')

    writeFileSync(configPath, original, 'utf-8')
  })
})

test.describe('Orchestrator Config Editor', () => {
  test('orchestrator config has correct structure', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(config.orchestrator).toBeDefined()
    expect(config.orchestrator.name).toBe('test-orchestrator')
    expect(config.orchestrator.project_root).toBe('.')
    expect(config.orchestrator.defaults.command).toBe('echo')
    expect(config.orchestrator.concurrency.max).toBe(1)
    expect(config.orchestrator.logging.dir).toBe('./logs')
    expect(config.orchestrator.logging.per_task).toBe(true)
    expect(config.orchestrator.persistence.file).toBe('.state.json')
  })

  test('orchestrator triggers are correct', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    const trigger = config.orchestrator.triggers[0]
    expect(trigger.name).toBe('test-trigger')
    expect(trigger.type).toBe('gitlab-issues')
    expect(trigger.gitlab.project).toBe('test/project')
    expect(trigger.gitlab.labels).toEqual(['ai:todo'])
    expect(trigger.poll_interval).toBe('4h')
    expect(trigger.priority).toBe(1)
    expect(trigger.pipeline).toBe('test-pipe')
  })

  test('orchestrator pipelines are correct', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    const pipe = config.orchestrator.pipelines['test-pipe']
    expect(pipe).toBeDefined()
    expect(pipe.state.on_start.remove_labels).toEqual(['ai:todo'])
    expect(pipe.state.on_start.add_labels).toEqual(['ai:in-progress'])
    expect(pipe.state.on_success.add_labels).toEqual(['ai:done'])
    expect(pipe.steps).toHaveLength(1)
    expect(pipe.steps[0].name).toBe('do-work')
  })

  test('can add trigger to orchestrator', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    config.orchestrator.triggers.push({
      name: 'ci-watcher',
      type: 'gitlab-ci',
      gitlab: {
        project: 'test/project',
        username: 'testuser',
        watch_jobs: ['unit-tests', 'lint']
      },
      poll_interval: '5m',
      priority: 2,
      pipeline: 'test-pipe'
    })

    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.orchestrator.triggers).toHaveLength(2)
    expect(reloaded.orchestrator.triggers[1].name).toBe('ci-watcher')
    expect(reloaded.orchestrator.triggers[1].type).toBe('gitlab-ci')

    writeFileSync(configPath, original, 'utf-8')
  })

  test('can add pipeline to orchestrator', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    config.orchestrator.pipelines['fix-ci'] = {
      state: {
        on_start: { add_labels: ['ai:fixing'] },
        on_success: { remove_labels: ['ai:fixing'], add_labels: ['ai:fixed'] }
      },
      steps: [
        { name: 'fix', prompt: 'Fix the CI failure' },
        { action: 'gitlab-comment', issue: '{{ .issue_iid }}', body: 'Fixed!' }
      ]
    }

    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.orchestrator.pipelines['fix-ci']).toBeDefined()
    expect(reloaded.orchestrator.pipelines['fix-ci'].steps).toHaveLength(2)
    expect(reloaded.orchestrator.pipelines['fix-ci'].steps[1].action).toBe('gitlab-comment')

    writeFileSync(configPath, original, 'utf-8')
  })

  test('can add SSH to orchestrator defaults', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    config.orchestrator.defaults.ssh = {
      host: '10.0.0.1',
      user: 'agent',
      tmux: { session: 'orch', ttl: '72h' }
    }

    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.orchestrator.defaults.ssh.host).toBe('10.0.0.1')
    expect(reloaded.orchestrator.defaults.ssh.tmux.session).toBe('orch')

    writeFileSync(configPath, original, 'utf-8')
  })
})

test.describe('Step Reordering', () => {
  test('can reorder steps in pipeline config', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const original = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    // Swap step 1 and step 2
    const [first] = config.pipeline.steps.splice(0, 1)
    config.pipeline.steps.splice(1, 0, first)

    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.pipeline.steps[0].name).toBe('step-2')
    expect(reloaded.pipeline.steps[1].name).toBe('step-1')

    writeFileSync(configPath, original, 'utf-8')
  })
})
