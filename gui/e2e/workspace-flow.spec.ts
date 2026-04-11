import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'

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

// Helper: set workspace in the app via zustand + IPC
async function openWorkspace() {
  await page.evaluate(async (wsPath) => {
    const configs = await window.electronAPI.getWorkspaceConfigs(wsPath)
    // Access zustand store via internal API
    const { useStore } = await import('./hooks/use-store')
  }, testWorkspace)

  // Use a different approach - click sidebar Config tab then programmatically
  // set workspace via the renderer's window
  const sidebar = page.locator('div.flex.h-full.w-14 button')
  await sidebar.nth(1).click() // Config tab

  // Inject workspace state directly
  await page.evaluate((wsPath) => {
    // Find and update zustand store through DOM inspection won't work
    // Instead, we'll test IPC directly and verify the data
  }, testWorkspace)
}

test.describe('Config Save/Load Round Trip', () => {
  test('save and reload config preserves data', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const originalContent = readFileSync(configPath, 'utf-8')

    // Load config via IPC
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(config.pipeline.name).toBe('test-pipeline')
    expect(config.pipeline.steps).toHaveLength(2)

    // Modify and save
    config.pipeline.name = 'test-pipeline-modified'
    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    // Reload and verify
    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.pipeline.name).toBe('test-pipeline-modified')

    // Restore original
    writeFileSync(configPath, originalContent, 'utf-8')
  })

  test('save and reload orchestrator config', async () => {
    const configPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const originalContent = readFileSync(configPath, 'utf-8')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(config.orchestrator.triggers).toHaveLength(1)
    expect(config.orchestrator.pipelines['test-pipe']).toBeDefined()

    // Modify trigger poll interval
    config.orchestrator.triggers[0].poll_interval = '8h'
    await page.evaluate(async ({ path, config }) => {
      await window.electronAPI.saveConfigFile(path, config)
    }, { path: configPath, config })

    // Reload
    const reloaded = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, configPath)

    expect(reloaded.orchestrator.triggers[0].poll_interval).toBe('8h')

    // Restore
    writeFileSync(configPath, originalContent, 'utf-8')
  })
})

test.describe('New Config Creation', () => {
  const newPipelinePath = path.join(testWorkspace, 'configs/pipeline.yaml')
  const newOrchPath = path.join(testWorkspace, 'configs/orchestrator.yaml')

  test.afterEach(() => {
    // Clean up created files
    if (existsSync(newPipelinePath)) unlinkSync(newPipelinePath)
    if (existsSync(newOrchPath)) unlinkSync(newOrchPath)
  })

  test('create new pipeline config', async () => {
    const configsDir = path.join(testWorkspace, 'configs')
    const resultPath = await page.evaluate(async ({ dir }) => {
      return await window.electronAPI.createNewConfig(dir, 'pipeline')
    }, { dir: configsDir })

    expect(resultPath).toContain('pipeline.yaml')
    expect(existsSync(newPipelinePath)).toBe(true)

    // Verify the created config is valid
    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, resultPath)

    expect(config.pipeline).toBeDefined()
    expect(config.pipeline.name).toBe('my-pipeline')
    expect(config.pipeline.steps.length).toBeGreaterThan(0)
  })

  test('create new orchestrator config', async () => {
    const configsDir = path.join(testWorkspace, 'configs')
    const resultPath = await page.evaluate(async ({ dir }) => {
      return await window.electronAPI.createNewConfig(dir, 'orchestrator')
    }, { dir: configsDir })

    expect(resultPath).toContain('orchestrator.yaml')

    const config = await page.evaluate(async (p) => {
      return await window.electronAPI.loadConfigFile(p)
    }, resultPath)

    expect(config.orchestrator).toBeDefined()
    expect(config.orchestrator.name).toBe('my-orchestrator')
    expect(config.orchestrator.triggers.length).toBeGreaterThan(0)
  })
})

test.describe('History Data', () => {
  test('history entries have correct structure', async () => {
    const history = await page.evaluate(async (wsPath) => {
      return await window.electronAPI.getWorkspaceHistory(wsPath)
    }, testWorkspace)

    // Verify success entry
    const success = history.find((r: any) => r.status === 'success')
    expect(success).toBeDefined()
    expect(success.pipeline).toBe('test-pipeline')
    expect(success.duration).toBe('5m0s')
    expect(success.steps).toHaveLength(1)
    expect(success.tmux).toBeDefined()
    expect(success.tmux.session).toBe('test-20260411-100000')
    expect(success.tmux.attach).toContain('tmux attach')

    // Verify failure entry
    const failure = history.find((r: any) => r.status === 'failure')
    expect(failure).toBeDefined()
    expect(failure.error).toContain('exit code 1')
    expect(failure.steps[0].status).toBe('failure')
  })

  test('history sorted by most recent first', async () => {
    const history = await page.evaluate(async (wsPath) => {
      return await window.electronAPI.getWorkspaceHistory(wsPath)
    }, testWorkspace)

    expect(history[0].started_at > history[1].started_at).toBe(true)
  })
})

test.describe('Log Viewer Data', () => {
  test('log content contains expected lines', async () => {
    const logPath = path.join(testWorkspace, 'logs/test-20260411-100000.log')
    const content = await page.evaluate(async (p) => {
      return await window.electronAPI.readLogFile(p)
    }, logPath)

    expect(content).toContain('level=INFO')
    expect(content).toContain('level=WARN')
    expect(content).toContain('level=ERROR')
    expect(content).toContain('starting iteration')
    expect(content).toContain('agent completed')
  })
})

test.describe('Execution Page UI', () => {
  test('shows correct controls', async () => {
    const sidebar = page.locator('div.flex.h-full.w-14 button')
    await sidebar.nth(2).click() // Run tab
    await page.waitForTimeout(300)

    await expect(page.locator('button:has-text("Start")')).toBeVisible()
    await expect(page.locator('button:has-text("Stop")')).toBeVisible()
    await expect(page.locator('text=--once')).toBeVisible()
    // "stopped" appears in both header badge and execution badge
    await expect(page.getByText('stopped').first()).toBeVisible()
  })

  test('start button disabled without config', async () => {
    const sidebar = page.locator('div.flex.h-full.w-14 button')
    await sidebar.nth(2).click()
    await page.waitForTimeout(300)

    const startBtn = page.locator('button:has-text("Start")')
    await expect(startBtn).toBeDisabled()
  })

  test('stop button disabled when not running', async () => {
    const sidebar = page.locator('div.flex.h-full.w-14 button')
    await sidebar.nth(2).click()
    await page.waitForTimeout(300)

    const stopBtn = page.locator('button:has-text("Stop")')
    await expect(stopBtn).toBeDisabled()
  })

  test('shows output placeholder', async () => {
    const sidebar = page.locator('div.flex.h-full.w-14 button')
    await sidebar.nth(2).click()
    await page.waitForTimeout(300)

    // Text from ExecutionPage when no config selected
    await expect(page.locator('text=Select a config first').or(page.locator('text=Press Start'))).toBeVisible()
  })
})
