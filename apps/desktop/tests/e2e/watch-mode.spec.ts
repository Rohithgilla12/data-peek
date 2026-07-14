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

test('start watch mode, see it running, and stop it', async ({ window, electronApp }) => {
  // The default window is narrower than the editor layout's minimum width, so the
  // page scrolls horizontally and the watch popover can land outside the viewport.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setSize(1720, 1000)
    win.center()
  })

  await openQueryTab(window)

  // 1. Type a watchable query and run it — Watch Mode overlays diff decorations
  // on an existing results table; it never renders rows itself, so the table
  // must be populated before the watch starts.
  await typeInMonaco(window, 'SELECT id, email, name FROM users ORDER BY email LIMIT 3')
  const runShortcut = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  await window.keyboard.press(runShortcut)
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 15000 })

  // 2. Start watch mode (the button is just labeled "Watch")
  // Using exact: true in case there are other things containing Watch
  const watchBtn = window.getByRole('button', { name: 'Watch', exact: true })
  await expect(watchBtn).toBeVisible({ timeout: 5000 })
  await watchBtn.click()

  // 3. Verify it says "Watching…" or "Watching · 1s"
  await expect(window.getByText(/Watching/)).toBeVisible({ timeout: 5000 })

  // 4. The watch ticks against the same query — the table keeps its rows.
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 15000 })

  // 5. Open the watch popover — target the toolbar button by its data attribute;
  // the tab header also reads "Watching …" and trips strict mode.
  const watchingBtn = window.locator('button[data-watch-active]')
  await watchingBtn.click()

  // 6. Click the "Stop" button in the popover. Dispatch the click via the DOM:
  // Playwright's viewport for Electron stays at the launch window size, so a
  // popover near the right edge is judged "outside of the viewport" and a
  // mouse click retries forever even though the button is on screen.
  const stopBtn = window.getByRole('button', { name: /Stop/i })
  await expect(stopBtn).toBeVisible({ timeout: 5000 })
  await stopBtn.dispatchEvent('click')

  // 7. Verify it reverted back to "Watch"
  await expect(window.getByRole('button', { name: 'Watch', exact: true })).toBeVisible({
    timeout: 5000
  })
})
