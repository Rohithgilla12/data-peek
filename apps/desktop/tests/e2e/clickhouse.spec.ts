import { test, expect } from './fixtures/electron-app'
import { startSeededClickHouse, type SeededClickHouse } from './fixtures/clickhouse'

/**
 * ClickHouse end to end through the real renderer: the connection dialog, the schema
 * explorer, the query editor, and the features that must stay hidden for ClickHouse.
 * Row counts come from seeds/clickhouse/init/01_acme_analytics.sql.
 */

type Page = import('@playwright/test').Page

let ch: SeededClickHouse

test.beforeAll(async () => {
  ch = await startSeededClickHouse()
})

test.afterAll(async () => {
  await ch?.stop()
})

function sheet(window: Page) {
  return window.locator('[data-slot="sheet-content"]')
}

async function activateSeededConnection(window: Page) {
  await window.evaluate((cfg) => window.api.connections.add(cfg), ch.config)
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  await window.locator('[data-sidebar="menu-button"]').first().click()
  const item = window.locator('[role="menuitem"]').filter({ hasText: ch.config.name })
  await expect(item).toBeVisible({ timeout: 8000 })
  await item.click()
  await expect(window.locator('header').getByText(ch.config.name)).toBeVisible({ timeout: 8000 })
}

/** The schema tree row for a table; the sidebar search palette renders the same names. */
function treeRow(window: Page, name: string) {
  return window
    .locator('[data-sidebar="menu-sub-item"]')
    .filter({ has: window.getByText(name, { exact: true }) })
}

async function revealTable(window: Page, name: string) {
  const row = treeRow(window, name)
  if (!(await row.isVisible())) {
    await window.getByText('acme_analytics', { exact: true }).first().click()
  }
  await expect(row).toBeVisible({ timeout: 15000 })
  return row
}

test('connection dialog creates a ClickHouse connection', async ({ window }, testInfo) => {
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 5000 })
  await window.getByRole('button', { name: /add connection/i }).click()
  await expect(sheet(window)).toBeVisible({ timeout: 5000 })

  await sheet(window).getByRole('button', { name: 'ClickHouse', exact: true }).click()
  await expect(sheet(window).locator('#port')).toHaveValue('8123')

  const d = sheet(window)
  await d.locator('#name').fill(ch.config.name)
  await d.locator('#host').fill(ch.config.host)
  await d.locator('#port').fill(String(ch.config.port))
  await d.locator('#database').fill(ch.config.database)
  await d.locator('#user').fill(ch.config.user)
  await d.locator('#password').fill(ch.config.password)
  await testInfo.attach('dialog', { body: await window.screenshot(), contentType: 'image/png' })

  await d.getByRole('button', { name: 'Test Connection' }).click()
  await expect(d.getByRole('status')).toContainText(/connection successful/i, { timeout: 15000 })

  await d.getByRole('button', { name: /save connection/i }).click()
  await expect(sheet(window)).toBeHidden({ timeout: 5000 })

  const list = await window.evaluate(() => window.api.connections.list())
  const saved = (list.data ?? []).find((c: { name: string }) => c.name === ch.config.name)
  expect(saved?.dbType).toBe('clickhouse')
})

test('schema explorer lists seeded tables, views and materialized views', async ({
  window
}, testInfo) => {
  await activateSeededConnection(window)
  await revealTable(window, 'events')
  await expect(treeRow(window, 'daily_events_mv')).toContainText('mview')
  await expect(treeRow(window, 'active_orgs')).toContainText('view')
  await expect(treeRow(window, 'odd-names')).toBeVisible()
  await testInfo.attach('schema', { body: await window.screenshot(), contentType: 'image/png' })
})

test('query editor runs ClickHouse SQL and renders typed results', async ({ window }, testInfo) => {
  await activateSeededConnection(window)

  const newQuery = window.getByRole('button', { name: /new query/i })
  if (await newQuery.isVisible()) {
    await newQuery.click()
  } else {
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+t' : 'Control+t')
  }
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })

  await window.locator('.monaco-editor').first().click()
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await window.keyboard.type(
    'SELECT event_type, count() AS n, max(big_counter) AS top FROM acme_analytics.events GROUP BY event_type ORDER BY event_type'
  )
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')

  await expect(window.getByText('page_view', { exact: true }).first()).toBeVisible({
    timeout: 15000
  })
  await expect(window.getByText('18446744073709551615').first()).toBeVisible()
  await expect(window.getByText('10000', { exact: true }).first()).toBeVisible()
  await testInfo.attach('results', { body: await window.screenshot(), contentType: 'image/png' })
})

test('gated features stay hidden for ClickHouse', async ({ window }, testInfo) => {
  await activateSeededConnection(window)
  const row = await revealTable(window, 'organizations')
  await row.hover()
  await row.getByRole('button').last().click()

  const menu = window.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: /view data/i })).toBeVisible()
  await testInfo.attach('table-menu', { body: await window.screenshot(), contentType: 'image/png' })
  for (const hidden of [/edit table/i, /import csv/i, /generate data/i]) {
    await expect(menu.getByRole('menuitem', { name: hidden })).toHaveCount(0)
  }
  await window.keyboard.press('Escape')

  await expect(window.getByTitle('Create new table')).toHaveCount(0)
  await expect(window.getByRole('button', { name: /notifications/i })).toHaveCount(0)
})
