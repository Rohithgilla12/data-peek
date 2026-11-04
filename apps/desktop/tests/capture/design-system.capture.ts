import { _electron, type Page } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test as recordingTest, expect } from './fixtures/recording-app'

const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js')

/**
 * Same harness (seeded Postgres, `window`, window sizing), minus video: these are
 * stills, and Playwright's Electron screencast never attaches under Xvfb, which
 * hangs the stock `recordedApp` fixture during setup.
 */
const test = recordingTest.extend({
  recordedApp: async ({ userDataDir }, use) => {
    if (!existsSync(MAIN_ENTRY)) {
      throw new Error(`Electron main bundle not found at ${MAIN_ENTRY}. Run \`pnpm build\` first.`)
    }
    const app = await _electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, DP_E2E: '1', NODE_ENV: 'production' }
    })
    await use(app)
    await app.close()
  }
})

/**
 * Baseline screenshots for the design-system refresh. Not a marketing clip: the
 * run just writes `test-results/design-system/<theme>-<screen>.png` so changes to
 * icons, colours, and typography can be compared before and after.
 *
 * Run: `pnpm capture -g design-system`
 */
const OUT_DIR = resolve(__dirname, '..', '..', 'test-results', 'design-system')

const THEMES = ['dark', 'light'] as const

const ASK_MESSAGES = [
  {
    id: 'ds-1',
    role: 'user',
    content: 'Which organizations have the most paid invoices?',
    createdAt: '2026-01-01T10:00:00.000Z'
  },
  {
    id: 'ds-2',
    role: 'assistant',
    content: 'Here is a query that ranks organizations by their paid invoice count.',
    responseData: {
      type: 'query',
      sql:
        'SELECT o.name, COUNT(i.id) AS paid_invoices\nFROM organizations o\n' +
        "JOIN invoices i ON i.organization_id = o.id\nWHERE i.status = 'paid'\n" +
        'GROUP BY o.name\nORDER BY paid_invoices DESC\nLIMIT 10',
      explanation: 'Counts paid invoices per organization and keeps the top ten.',
      warning: 'The invoices table is large; this query scans every paid invoice.'
    },
    createdAt: '2026-01-01T10:00:02.000Z'
  }
]

const RESULTS_QUERY = 'SELECT id, email, name FROM users ORDER BY email LIMIT 50'

async function runQuery(window: Page, sql: string): Promise<void> {
  await window.locator('.monaco-editor').first().click()
  await window.keyboard.press('ControlOrMeta+a')
  await window.keyboard.press('Delete')
  await window.keyboard.insertText(sql)
  await window.getByRole('button', { name: /^Run/ }).click()
}

for (const theme of THEMES) {
  test(`design-system ${theme}`, async ({ window, pg }) => {
    mkdirSync(OUT_DIR, { recursive: true })
    const shot = async (screen: string): Promise<void> => {
      await window.waitForTimeout(600)
      await window.screenshot({ path: resolve(OUT_DIR, `${theme}-${screen}.png`) })
    }

    // Seed the Ask panel without a model: a keyless provider counts as configured,
    // and a stored chat session supplies the conversation.
    await window.evaluate(
      async ({ connectionId, messages }) => {
        await window.api.ai.setMultiProviderConfig({
          providers: { ollama: { baseUrl: 'http://localhost:11434' } },
          activeProvider: 'ollama',
          activeModels: { ollama: 'llama3' }
        })
        const created = await window.api.ai.createSession(connectionId, 'Top organizations')
        if (!created.success || !created.data) throw new Error('createSession failed')
        await window.api.ai.updateSession(connectionId, created.data.id, { messages })
      },
      { connectionId: pg.config.id, messages: ASK_MESSAGES }
    )
    // ThemeProvider reads localStorage once at mount, so the theme must be in place
    // before the page loads. The fixture's init script pins 'dark' on every load;
    // this one is registered after it and so wins.
    await window.addInitScript((t) => localStorage.setItem('data-peek-theme', t), theme)
    await window.reload()
    await window.waitForSelector('#root', { timeout: 15000 })
    await expect(window.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))

    // The harness only adds the connection; select it.
    await window.locator('[data-sidebar="menu-button"]').first().click()
    await window.locator('[role="menuitem"]').filter({ hasText: pg.config.name }).click()
    await expect(window.locator('header').getByText(pg.config.name)).toBeVisible({ timeout: 8000 })
    await window.waitForTimeout(800)

    // connection-dialog
    await window.locator('[data-sidebar="menu-button"]').first().click()
    await window.getByRole('menuitem', { name: /add connection/i }).click()
    await expect(window.getByText('Add Connection').first()).toBeVisible({ timeout: 5000 })
    await shot('connection-dialog')
    await window.keyboard.press('Escape')
    await expect(window.getByText('Add Connection').first()).toBeHidden({ timeout: 5000 })

    // ask
    await window.keyboard.press('ControlOrMeta+i')
    await expect(window.getByText('Which organizations have the most paid invoices?')).toBeVisible({
      timeout: 10000
    })
    await shot('ask')
    await window.keyboard.press('ControlOrMeta+i')

    // schema-sidebar: the public schema tree loads expanded
    await expect(window.getByText('subscriptions', { exact: true })).toBeVisible({
      timeout: 15000
    })
    await shot('schema-sidebar')

    // table-preview-tab
    await window.getByText('users', { exact: true }).first().click()
    await expect(window.locator('table, [role="grid"]').first()).toBeVisible({ timeout: 15000 })
    await shot('table-preview-tab')

    // results-grid, telemetry
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })
    await runQuery(window, RESULTS_QUERY)
    await expect(window.getByText(/rows returned/)).toBeVisible({ timeout: 15000 })
    await shot('results-grid')

    await window.getByRole('button', { name: 'Telemetry' }).click()
    await expect(window.getByText(/Execution|Network|Total/).first()).toBeVisible({
      timeout: 10000
    })
    await shot('telemetry')
    await window.getByRole('button', { name: 'Telemetry' }).click()

    // warning-state: a 1.3s query trips the 1s slow-query rule in the performance
    // analysis (a warning, not critical, below 2s). Deterministic regardless of data size.
    await runQuery(window, 'SELECT pg_sleep(1.3)')
    await expect(window.getByText(/rows? returned/)).toBeVisible({ timeout: 20000 })
    await window
      .getByRole('button', { name: /Analyze/ })
      .last()
      .click()
    const slowCard = window.getByText('Slow Query').first()
    await expect(slowCard).toBeVisible({ timeout: 30000 })
    // The card sits at the bottom edge; hiding the editor frees the room to show all of it.
    await window.locator('button[title="Hide query editor"]').click()
    await slowCard.scrollIntoViewIfNeeded()
    await shot('warning-state')
    await window.locator('button[title="Show query editor"]').click()

    // error-state: a query that fails
    await runQuery(window, 'SELECT * FROM table_that_does_not_exist')
    await expect(window.getByText(/does not exist/i).first()).toBeVisible({ timeout: 15000 })
    await shot('error-state')

    // erd-tab
    await window.locator('button[title="View ERD diagram"]').click()
    await expect(window.locator('.react-flow__node').first()).toBeVisible({ timeout: 15000 })
    await window.locator('.react-flow__controls-fitview').click()
    await window.waitForTimeout(800)
    await shot('erd-tab')

    // settings (last: it is a separate route)
    await window.getByRole('link', { name: 'Settings' }).click()
    await expect(window.getByText(/appearance|general/i).first()).toBeVisible({ timeout: 10000 })
    await shot('settings')
  })
}
