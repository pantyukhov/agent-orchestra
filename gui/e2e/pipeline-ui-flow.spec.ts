import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

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

async function openConfigInEditor(cfgPath: string) {
  await page.evaluate(async ({ wsPath, cfgPath }) => {
    const store = (window as any).__store
    const configs = await window.electronAPI.getWorkspaceConfigs(wsPath)
    const config = await window.electronAPI.loadConfigFile(cfgPath)
    store.getState().setWorkspace(wsPath, configs)
    store.getState().setConfig(cfgPath, config)
  }, { wsPath: testWorkspace, cfgPath })
  await page.waitForTimeout(500)
}

test('pipeline editor renders all sections', async () => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  const cfgPath = path.join(testWorkspace, 'configs/test-pipeline.yaml')
  await openConfigInEditor(cfgPath)

  // General section
  await expect(page.locator('h2:has-text("General")')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('input[value="test-pipeline"]')).toBeVisible()

  // Defaults section
  await expect(page.locator('h2:has-text("Defaults")')).toBeVisible()

  // Loop section
  await expect(page.locator('h2:has-text("Loop")')).toBeVisible()

  // Steps section
  await expect(page.locator('h2:has-text("Steps (2)")')).toBeVisible()
  await expect(page.locator('text=step-1').first()).toBeVisible()
  await expect(page.locator('text=step-2').first()).toBeVisible()

  // Toolbar
  await expect(page.locator('button:has-text("Save")')).toBeVisible()
  await expect(page.locator('button:has-text("Run")')).toBeVisible()

  if (errors.length > 0) console.error('ERRORS:', errors)
  expect(errors).toEqual([])
})

test('pipeline with SSH/tmux renders SSH section', async () => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  const helloPath = '/Users/pavelpantiukhov/Projects/agents-workspace/configs/hello-world.yaml'
  await openConfigInEditor(helloPath)

  // SSH section should be visible
  await expect(page.locator('h2:has-text("SSH Remote Execution")')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('input[value="178.104.78.35"]')).toBeVisible()

  // tmux section
  await expect(page.locator('text=tmux').first()).toBeVisible()
  await expect(page.locator('input[value="72h"]').first()).toBeVisible()

  // Steps
  await expect(page.locator('h2:has-text("Steps (1)")')).toBeVisible()

  if (errors.length > 0) console.error('ERRORS:', errors)
  expect(errors).toEqual([])
})

test('orchestrator editor renders all sections', async () => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  const cfgPath = path.join(testWorkspace, 'configs/test-orchestrator.yaml')
  await openConfigInEditor(cfgPath)

  // General
  await expect(page.locator('h2:has-text("General")')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('input[value="test-orchestrator"]')).toBeVisible()

  // Runtime
  await expect(page.locator('h2:has-text("Runtime")')).toBeVisible()

  // Triggers
  await expect(page.locator('h2:has-text("Triggers (1)")')).toBeVisible()
  await expect(page.locator('text=test-trigger').first()).toBeVisible()

  // Pipelines
  await expect(page.locator('h2:has-text("Pipelines (1)")')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'test-pipe' })).toBeVisible()

  if (errors.length > 0) console.error('ERRORS:', errors)
  expect(errors).toEqual([])
})
