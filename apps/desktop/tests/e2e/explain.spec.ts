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

test.beforeEach(async ({ window }) => {
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  await window.locator('[data-sidebar="menu-button"]').first().click()
  const connectionItem = window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })
  await expect(connectionItem).toBeVisible({ timeout: 8000 })
  await connectionItem.click()
  await expect(window.locator('header').getByText(pg.config.name)).toBeVisible({ timeout: 5000 })

  await sql(window, 'DROP TABLE IF EXISTS explain_e2e')
  await sql(window, 'CREATE TABLE explain_e2e (id int PRIMARY KEY)')
  await sql(window, 'INSERT INTO explain_e2e VALUES (1), (2), (3)')
})

async function sql(window: Page, query: string): Promise<Array<Record<string, unknown>>> {
  const res = await window.evaluate(([cfg, q]) => window.api.db.query(cfg, q), [
    pg.config,
    query
  ] as const)
  expect(res.success, res.error).toBe(true)
  return (res.data as { rows: Array<Record<string, unknown>> }).rows
}

async function rowCount(window: Page): Promise<number> {
  const rows = await sql(window, 'SELECT count(*)::int AS n FROM explain_e2e')
  return rows[0].n as number
}

async function explainInEditor(window: Page, query: string): Promise<void> {
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
  await window.keyboard.type(query)
  await window.getByRole('button', { name: /^explain$/i }).click()
}

test('Explain on a DELETE shows the plan and keeps every row', async ({ window }) => {
  await explainInEditor(window, 'DELETE FROM explain_e2e')

  await expect(window.getByText('Query Execution Plan')).toBeVisible({ timeout: 15000 })
  expect(await rowCount(window)).toBe(3)
})

test('Explain refuses a multi-statement buffer and keeps every row', async ({ window }) => {
  await explainInEditor(window, 'SELECT 1; DELETE FROM explain_e2e')

  await expect(window.getByText(/single statement, found 2/)).toBeVisible({ timeout: 15000 })
  expect(await rowCount(window)).toBe(3)
})
