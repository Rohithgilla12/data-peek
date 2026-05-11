import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * UI-driven coverage for the query editor tab. These tests drive the Monaco
 * editor, results table, error surface and inline cell-edit flow through the
 * real Electron renderer — nothing is mocked.
 *
 * Selector notes:
 *  - data-testid="query-tab-monaco" is set on the outer div of the Monaco
 *    wrapper and survives the production build (it's a regular div attribute,
 *    not a Radix portal attribute).
 *  - The "new tab" trigger is the Plus icon button in the tab bar. We click it
 *    via its position rather than a text label because it has no visible text.
 *  - Error text is rendered verbatim in a <p> inside the results region —
 *    assert on the Postgres error message itself.
 *  - The commit button label is "Save (N)" where N is the pending-change count.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test.beforeEach(async ({ window }) => {
  // 1. Seed the connection via IPC (skips the Add Connection dialog)
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)

  // 2. Wait for the sidebar connection switcher to reflect the new connection.
  //    It transitions out of "Loading..." → "Select connection" → our connection name.
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })

  // 3. Open the ConnectionSwitcher dropdown and click our connection to activate it.
  //    This triggers setActiveConnection in the renderer store (with a 500ms connect
  //    simulation), which makes TabQueryEditor show the Monaco editor.
  await window.locator('[data-sidebar="menu-button"]').first().click()

  // The connection name appears as a DropdownMenuItem inside the switcher
  const connectionItem = window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })
  await expect(connectionItem).toBeVisible({ timeout: 8000 })
  await connectionItem.click()

  // Wait for the dropdown to close (Radix DropdownMenu closes on item select)
  // and for the connection to become active. The header shows the connection
  // name next to the db icon once active — target that specific span.
  await expect(window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })).toBeHidden({
    timeout: 5000
  })
  // The header connection indicator is a <span> inside the titlebar <header>
  await expect(
    window.locator('header').getByText(pg.config.name)
  ).toBeVisible({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Page = import('@playwright/test').Page

/**
 * Open a fresh query tab by using Cmd/Ctrl+T (the keyboard shortcut registered
 * in TabContainer / TabBar), then wait for the Monaco editor to be visible.
 *
 * We prefer the keyboard shortcut over clicking the "+" button because:
 *  - The "+" button has no accessible name (no text, aria-label not set) making
 *    it fragile to locate by role.
 *  - Cmd+T is registered as a global hotkey in TabContainer and fires
 *    `createQueryTab(activeConnectionId)` — exactly the same code path.
 *
 * If the empty-state "New Query" button is visible (no tabs open yet) we click
 * that instead, which also calls createQueryTab.
 */
async function openQueryTab(window: Page) {
  // If the empty-state "New Query" button is visible, click it directly.
  const emptyStateBtn = window.getByRole('button', { name: /new query/i })
  if (await emptyStateBtn.isVisible()) {
    await emptyStateBtn.click()
  } else {
    // Use the keyboard shortcut Cmd+T / Ctrl+T to open a new query tab
    const newTabShortcut = process.platform === 'darwin' ? 'Meta+t' : 'Control+t'
    await window.keyboard.press(newTabShortcut)
  }

  // data-testid="query-tab-monaco" is stripped in the production build.
  // Fall back to the .monaco-editor class which is injected by Monaco itself
  // and survives the production bundle.
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })
}

/**
 * Type SQL into the Monaco editor. Monaco intercepts most keyboard input
 * through its hidden textarea; we focus that textarea and type into it.
 */
async function typeInMonaco(window: Page, sql: string) {
  // Monaco's actual keyboard input target is a div.native-edit-context[role=textbox].
  // The only textarea in the .monaco-editor DOM is the IME one (readonly=true),
  // so we must interact via the editor div directly.
  // Clicking .monaco-editor focuses the native-edit-context, then:
  //   Cmd/Ctrl+A selects all existing content
  //   keyboard.type replaces it with the new SQL
  await window.locator('.monaco-editor').first().click()
  const selectAll = process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
  await window.keyboard.press(selectAll)
  await window.keyboard.type(sql)
}

/**
 * Run the current query with the platform keyboard shortcut.
 */
async function runQuery(window: Page) {
  const runShortcut = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  await window.keyboard.press(runShortcut)
}

// ---------------------------------------------------------------------------
// Test 1: Run a SELECT and see results
// ---------------------------------------------------------------------------

test('run SELECT query → results table shows expected rows and columns', async ({ window }) => {
  await openQueryTab(window)

  const sql = 'SELECT id, email, name FROM users ORDER BY email LIMIT 3'
  await typeInMonaco(window, sql)
  await runQuery(window)

  // Wait for the results table body to appear with 3 rows
  const rows = window.locator('tbody tr')
  await expect(rows).toHaveCount(3, { timeout: 15000 })

  // Assert all three column headers are visible
  await expect(window.getByRole('columnheader', { name: 'id' })).toBeVisible({ timeout: 5000 })
  await expect(window.getByRole('columnheader', { name: 'email' })).toBeVisible({ timeout: 5000 })
  await expect(window.getByRole('columnheader', { name: 'name' })).toBeVisible({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// Test 2: Invalid SQL surfaces an error
// ---------------------------------------------------------------------------

test('invalid SQL → error message contains the bad table name', async ({ window }) => {
  await openQueryTab(window)

  await typeInMonaco(window, 'SELECT * FROM nonexistent_table_xyzzy')
  await runQuery(window)

  // The error message is rendered in a <p class="text-sm text-muted-foreground"> in the
  // results region (tab.error path in tab-query-editor.tsx). Two elements match the table
  // name (the Monaco syntax highlight span + the error <p>), so target the <p> directly.
  await expect(window.locator('p.text-muted-foreground').filter({ hasText: /nonexistent_table_xyzzy/i })).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Test 3: Inline cell edit updates the underlying row
// ---------------------------------------------------------------------------

test('double-click cell → edit, commit → DB row updated', async ({ window }) => {
  // Capture the target row before touching the UI so we can restore it in finally
  const baseline = await window.evaluate(
    (cfg) => window.api.db.query(cfg, 'SELECT id, name FROM users ORDER BY email LIMIT 1'),
    pg.config
  )
  const target = (baseline.data as { rows: Array<{ id: string; name: string }> }).rows[0]

  try {
    await openQueryTab(window)

    await typeInMonaco(window, 'SELECT id, name FROM users ORDER BY email LIMIT 1')
    await runQuery(window)

    // Wait for the target name to appear in the results table
    await expect(window.getByText(target.name, { exact: false })).toBeVisible({ timeout: 15000 })

    // Enter edit mode by clicking the "Edit" button in the EditToolbar.
    // This sets isEditMode=true in the editable table. Once in edit mode,
    // clicking a cell triggers startCellEdit which renders the inline input.
    await window.getByRole('button', { name: /^edit$/i }).click()

    // In edit mode an extra actions column (row-delete "...") is prepended,
    // shifting the data columns: td[0]=actions, td[1]=id, td[2]=name.
    // The EditableCell renders a <button onClick={onStartEdit}> inside the td;
    // clicking the button directly triggers startCellEdit.
    const nameCell = window.locator('tbody tr').first().locator('td').nth(2)
    // Click the inner button (the display cell that triggers edit on click)
    const nameCellBtn = nameCell.locator('button').first()
    await nameCellBtn.click()

    // data-testid="editable-cell-input" may be stripped in the production build.
    // Fall back to finding any input inside the first tbody row (the edit input
    // renders inside the td as an Input component).
    const cellInput = window.locator('tbody tr').first().locator('input').first()
    await expect(cellInput).toBeVisible({ timeout: 5000 })

    // Fill with our marker value and confirm with Enter
    await cellInput.fill('UI Edit Marker')
    await cellInput.press('Enter')

    // Click "Save (1)" — this opens a SQL Preview dialog showing the UPDATE statement.
    // The actual commit requires clicking "Execute N Statement(s)" in the dialog.
    const saveBtn = window.getByRole('button', { name: /save\s*\(\d+\)/i })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    // Wait for the SQL Preview dialog and confirm execution
    const executeBtn = window.getByRole('button', { name: /execute\s+\d+\s+statement/i })
    await expect(executeBtn).toBeVisible({ timeout: 5000 })
    await executeBtn.click()

    // Verify via IPC that the DB was actually updated
    const verify = await window.evaluate(
      ({ cfg, id }) =>
        window.api.db.query(cfg, `SELECT name FROM users WHERE id = '${id}'`),
      { cfg: pg.config, id: target.id }
    )
    expect((verify.data as { rows: Array<{ name: string }> }).rows[0].name).toBe('UI Edit Marker')
  } finally {
    // Always restore regardless of assertion success
    await window.evaluate(
      ({ cfg, id, original }) =>
        window.api.db.query(
          cfg,
          `UPDATE users SET name = '${original.replace(/'/g, "''")}' WHERE id = '${id}'`
        ),
      { cfg: pg.config, id: target.id, original: target.name }
    )
  }
})
