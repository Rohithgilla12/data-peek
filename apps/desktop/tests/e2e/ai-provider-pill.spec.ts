import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './fixtures/electron-app'

/**
 * The titlebar AI pill when no AI is configured. Detection is faked in main so
 * the result doesn't depend on which agent CLIs the test machine has installed.
 */
async function fakeDetectedClis(
  electronApp: ElectronApplication,
  window: Page,
  available: string[]
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, ids) => {
    ipcMain.removeHandler('ai:detect-harness')
    ipcMain.handle('ai:detect-harness', (_e, provider?: string) => ({
      success: true,
      data: { available: ids.includes(provider ?? ''), version: '1.0.0' }
    }))
  }, available)
  await window.reload()
  await expect(window.locator('#root')).toBeAttached()
}

test('several detected CLIs collapse into one Choose AI menu', async ({ electronApp, window }) => {
  await fakeDetectedClis(electronApp, window, ['claude-cli', 'codex-cli', 'antigravity-cli'])

  const trigger = window.getByRole('button', { name: 'Choose AI' })
  await expect(trigger).toBeVisible()
  await expect(window.getByText(/Use my .* subscription/)).toHaveCount(0)
  await expect(window.getByRole('button', { name: /^Use / })).toHaveCount(0)

  const box = await trigger.boundingBox()
  expect(box, 'pill is laid out').not.toBeNull()
  expect(box!.height, 'pill stays on one line').toBeLessThan(28)

  await window.screenshot({
    path: test.info().outputPath('titlebar-several-clis.png'),
    clip: { x: 0, y: 0, width: 1280, height: 60 }
  })

  await trigger.click()
  for (const label of ['Claude', 'Codex', 'Antigravity', 'Other providers…']) {
    await expect(window.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible()
  }
  await expect(window.getByRole('menu')).toHaveCSS('opacity', '1')
  await window.screenshot({
    path: test.info().outputPath('titlebar-several-clis-open.png'),
    clip: { x: 760, y: 0, width: 520, height: 200 }
  })

  await window.getByRole('menuitem', { name: /Codex/ }).click()
  await expect(window.getByRole('button', { name: /^Codex\s*your subscription$/ })).toBeVisible()
  const saved = await window.evaluate(() => window.api.ai.getMultiProviderConfig())
  expect(saved.data?.activeProvider, 'choice persisted in main').toBe('codex-cli')
})

test('a single detected CLI is one click', async ({ electronApp, window }) => {
  await fakeDetectedClis(electronApp, window, ['claude-cli'])

  const pill = window.getByRole('button', { name: /Use Claude/ })
  await expect(pill).toBeVisible()
  await expect(window.getByRole('button', { name: 'Choose AI' })).toHaveCount(0)
  await window.screenshot({
    path: test.info().outputPath('titlebar-one-cli.png'),
    clip: { x: 0, y: 0, width: 1280, height: 60 }
  })

  await pill.click()
  await expect(window.getByRole('button', { name: /^Claude\s*your subscription$/ })).toBeVisible()
})
