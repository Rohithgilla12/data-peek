import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test.beforeEach(async ({ window }) => {
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  await window.locator('[data-sidebar="menu-button"]').first().click()
  const connectionItem = window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })
  await expect(connectionItem).toBeVisible({ timeout: 8000 })
  await connectionItem.click()
  await expect(window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })).toBeHidden({
    timeout: 5000
  })
  await expect(window.locator('header').getByText(pg.config.name)).toBeVisible({ timeout: 5000 })
})

type Page = import('@playwright/test').Page

async function openQueryTab(window: Page) {
  const emptyStateBtn = window.getByRole('button', { name: /new query/i })
  if (await emptyStateBtn.isVisible()) {
    await emptyStateBtn.click()
  } else {
    const newTabShortcut = process.platform === 'darwin' ? 'Meta+t' : 'Control+t'
    await window.keyboard.press(newTabShortcut)
  }
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })
}

async function typeInMonaco(window: Page, sql: string) {
  await window.locator('.monaco-editor').first().click()
  const selectAll = process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
  await window.keyboard.press(selectAll)
  await window.keyboard.type(sql)
}

test('start watch mode, see it running, and stop it', async ({ window }) => {
  await openQueryTab(window)

  // 1. Type a query that is watchable
  await typeInMonaco(window, 'SELECT id, email, name FROM users ORDER BY email LIMIT 3')

  // 2. Start watch mode (the button is just labeled "Watch")
  // Using exact: true in case there are other things containing Watch
  const watchBtn = window.getByRole('button', { name: 'Watch', exact: true })
  await expect(watchBtn).toBeVisible({ timeout: 5000 })
  await watchBtn.click()

  // 3. Verify it says "Watching…" or "Watching · 1s"
  await expect(window.getByText(/Watching/)).toBeVisible({ timeout: 5000 })

  // 4. Wait for results table to appear (meaning it fired at least once)
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 15000 })

  // 5. Open the watch popover by right clicking (context menu) or clicking while enabled
  const watchingBtn = window.getByRole('button', { name: /Watching/ })
  await watchingBtn.click()

  // 6. Click the "Stop" button in the popover
  const stopBtn = window.getByRole('button', { name: /Stop/i })
  await expect(stopBtn).toBeVisible({ timeout: 5000 })
  await stopBtn.click()

  // 7. Verify it reverted back to "Watch"
  await expect(window.getByRole('button', { name: 'Watch', exact: true })).toBeVisible({ timeout: 5000 })
})
