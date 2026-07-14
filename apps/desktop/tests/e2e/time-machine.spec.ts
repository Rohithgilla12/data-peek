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

async function runQuery(window: Page) {
  const runShortcut = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  await window.keyboard.press(runShortcut)
}

test('run queries, open time machine strip, select past run', async ({ window }) => {
  await openQueryTab(window)

  // 1. Run first query
  await typeInMonaco(window, 'SELECT id, email, name FROM users ORDER BY email LIMIT 3')
  await runQuery(window)
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 15000 })

  // 2. Change the query slightly and run again
  await typeInMonaco(window, 'SELECT id, email, name FROM users ORDER BY email LIMIT 2')
  await runQuery(window)
  await expect(window.locator('tbody tr')).toHaveCount(2, { timeout: 15000 })

  // 3. Click the Time Machine button
  const timeMachineBtn = window.getByRole('button', { name: /Time Machine/i })
  await expect(timeMachineBtn).toBeVisible({ timeout: 5000 })
  await timeMachineBtn.click()

  // 4. Verify the Time Machine strip shows up with a chip per captured run.
  // Chips show capture time + row count (not SQL), and are the strip's only
  // font-mono buttons — the Live/close buttons aren't.
  const strip = window.getByTestId('time-machine-strip')
  await expect(strip).toBeVisible({ timeout: 5000 })
  const chips = strip.locator('button.font-mono')
  await expect(chips).toHaveCount(2, { timeout: 5000 })

  // 5. Click the past run — chips are chronological, so the first is LIMIT 3.
  await chips.first().click()

  // 6. Verify that it restores the old results table (3 rows)
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 5000 })

  // Verify it says Read-only
  await expect(window.getByText(/Read-only/i)).toBeVisible({ timeout: 5000 })
})
