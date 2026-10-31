import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

type Page = import('@playwright/test').Page

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

async function sql(window: Page, query: string): Promise<Array<Record<string, unknown>>> {
  const res = await window.evaluate(([c, q]) => window.api.db.query(c, q), [
    pg.config,
    query
  ] as const)
  expect(res.success, res.error).toBe(true)
  return (res.data as { rows: Array<Record<string, unknown>> }).rows
}

async function activate(window: Page, name: string): Promise<void> {
  await window.locator('[data-sidebar="menu-button"]').first().click()
  const item = window.locator('[role="menuitem"]').filter({ hasText: name })
  await expect(item).toBeVisible({ timeout: 8000 })
  await item.click()
  await expect(window.locator('header').getByText(name)).toBeVisible({ timeout: 5000 })
}

async function indexesOn(window: Page): Promise<string[]> {
  const rows = await sql(
    window,
    "SELECT indexname FROM pg_indexes WHERE tablename = 'perf_e2e' ORDER BY 1"
  )
  return rows.map((r) => r.indexname as string)
}

async function analyzeFilteredScan(window: Page): Promise<void> {
  const newQuery = window.getByRole('button', { name: /new query/i })
  if (await newQuery.isVisible()) {
    await newQuery.click()
  } else {
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+t' : 'Control+t')
  }
  const editor = window.locator('.monaco-editor').first()
  await expect(editor).toBeVisible({ timeout: 10000 })
  await editor.click()
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await window.keyboard.type('SELECT * FROM perf_e2e WHERE n = 7')
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(window.locator('tbody tr')).toHaveCount(1, { timeout: 15000 })
  await window
    .getByRole('button', { name: /^analyze$/i })
    .first()
    .click()
  await window.getByText('High Filter Selectivity').first().click()
}

test.beforeEach(async ({ window }) => {
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  await sql(window, 'DROP TABLE IF EXISTS perf_e2e')
  await sql(window, 'CREATE TABLE perf_e2e AS SELECT g AS n FROM generate_series(1, 2000) g')
  await activate(window, pg.config.name)
})

test('Apply Index creates the suggested index', async ({ window }) => {
  await analyzeFilteredScan(window)

  await window.getByRole('button', { name: /apply index/i }).click()

  // Success triggers a re-analysis that unmounts the card, so check the database, not the label.
  await expect.poll(() => indexesOn(window), { timeout: 15000 }).toEqual(['idx_perf_e2e_n'])
})

test('Apply Index shows the error when the statement fails', async ({ window }) => {
  await analyzeFilteredScan(window)
  await sql(window, 'DROP TABLE perf_e2e')

  await window.getByRole('button', { name: /apply index/i }).click()

  await expect(window.getByText(/perf_e2e" does not exist/)).toBeVisible({ timeout: 15000 })
  await expect(window.getByText('Index Applied!')).toBeHidden()
})
