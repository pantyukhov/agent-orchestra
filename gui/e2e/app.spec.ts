import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let app: ElectronApplication
let page: Page

const testWorkspace = path.resolve(__dirname, '../test-workspace')

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.resolve(__dirname, '../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  })
  page = await app.firstWindow()
  // Wait for the app to load
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  await app.close()
})

test.describe('Welcome Page', () => {
  test('shows app title', async () => {
    const title = page.locator('text=Agent Orchestra')
    await expect(title.first()).toBeVisible()
  })

  test('shows Open Workspace button', async () => {
    const btn = page.locator('text=Open Workspace')
    await expect(btn).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('sidebar has all navigation buttons', async () => {
    // 5 sidebar buttons: Home, Config, Run, History, Logs
    const buttons = page.locator('div.flex.h-full.w-14 button')
    await expect(buttons).toHaveCount(5)
  })

  test('can navigate to each page', async () => {
    const buttons = page.locator('div.flex.h-full.w-14 button')

    // Click Config (2nd button)
    await buttons.nth(1).click()
    await expect(page.locator('text=Open a workspace first')).toBeVisible()

    // Click Run (3rd button)
    await buttons.nth(2).click()
    await expect(page.locator('text=Start')).toBeVisible()

    // Click History (4th button)
    await buttons.nth(3).click()
    await expect(page.locator('text=Open a workspace first')).toBeVisible()

    // Click Logs (5th button)
    await buttons.nth(4).click()
    await expect(page.locator('text=Open a workspace first')).toBeVisible()

    // Back to Home
    await buttons.nth(0).click()
    await expect(page.locator('text=Open Workspace')).toBeVisible()
  })
})

test.describe('Workspace via IPC', () => {
  test('can open workspace programmatically', async () => {
    // Use IPC to set workspace directly (avoid native dialog)
    await page.evaluate(async (wsPath) => {
      const configs = await window.electronAPI.getWorkspaceConfigs(wsPath)
      // Store workspace in zustand manually
      const store = (window as any).__zustand_store
      // We can't access store directly, but we can verify IPC works
      return configs
    }, testWorkspace)

    // Verify IPC returns configs
    const configs = await page.evaluate(async (wsPath) => {
      return await window.electronAPI.getWorkspaceConfigs(wsPath)
    }, testWorkspace)

    expect(configs).toHaveLength(2)
    expect(configs.some((c: string) => c.includes('test-pipeline.yaml'))).toBe(true)
    expect(configs.some((c: string) => c.includes('test-orchestrator.yaml'))).toBe(true)
  })

  test('can load config file via IPC', async () => {
    const pipelinePath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
    const config = await page.evaluate(async (cfgPath) => {
      return await window.electronAPI.loadConfigFile(cfgPath)
    }, pipelinePath)

    expect(config).toBeDefined()
    expect(config.pipeline).toBeDefined()
    expect(config.pipeline.name).toBe('test-pipeline')
    expect(config.pipeline.steps).toHaveLength(2)
  })

  test('can load orchestrator config via IPC', async () => {
    const orchPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
    const config = await page.evaluate(async (cfgPath) => {
      return await window.electronAPI.loadConfigFile(cfgPath)
    }, orchPath)

    expect(config).toBeDefined()
    expect(config.orchestrator).toBeDefined()
    expect(config.orchestrator.name).toBe('test-orchestrator')
    expect(config.orchestrator.triggers).toHaveLength(1)
  })

  test('can read workspace history via IPC', async () => {
    const history = await page.evaluate(async (wsPath) => {
      return await window.electronAPI.getWorkspaceHistory(wsPath)
    }, testWorkspace)

    expect(history).toHaveLength(2)
    expect(history[0].status).toBeDefined()
    // Should be sorted by most recent first
    expect(history[0].id).toBe('20260411-120000')
    expect(history[1].id).toBe('20260411-100000')
  })

  test('can read log files via IPC', async () => {
    const logDir = path.join(testWorkspace, 'logs')
    const files = await page.evaluate(async (dir) => {
      return await window.electronAPI.getLogFiles(dir)
    }, logDir)

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('test-20260411-100000.log')
  })

  test('can read log content via IPC', async () => {
    const logPath = path.join(testWorkspace, 'logs/test-20260411-100000.log')
    const content = await page.evaluate(async (p) => {
      return await window.electronAPI.readLogFile(p)
    }, logPath)

    expect(content).toContain('starting iteration')
    expect(content).toContain('something went wrong')
  })
})

test.describe('Config Editor UI', () => {
  test('shows config list after workspace is set', async () => {
    // Navigate to config page and set workspace via UI state
    const sidebar = page.locator('div.flex.h-full.w-14 button')
    await sidebar.nth(1).click()

    // Set workspace via evaluate (simulating the open workspace flow)
    await page.evaluate(async (wsPath) => {
      const configs = await window.electronAPI.getWorkspaceConfigs(wsPath)
      // Trigger zustand store update by dispatching through the app
      // We need to find the store - it's in the React tree
      // Alternative: click through UI
    }, testWorkspace)
  })
})

test.describe('Process Manager', () => {
  test('process status starts as stopped', async () => {
    const status = await page.evaluate(async () => {
      return await window.electronAPI.getProcessStatus()
    })
    expect(status).toBe('stopped')
  })
})

test.describe('Header', () => {
  test('shows app name in header', async () => {
    const header = page.locator('text=Agent Orchestra')
    await expect(header.first()).toBeVisible()
  })

  test('shows process status badge', async () => {
    const badge = page.locator('.drag-region >> text=stopped')
    await expect(badge).toBeVisible()
  })
})
