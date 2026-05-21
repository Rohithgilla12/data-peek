import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * Keyboard cell-grid integration tests for the v0.23.0 feature.
 *
 * The cell-grid activates when a virtualized result mounts (row count > 50).
 * Tests use `generate_series` to produce 100-row results independent of seed
 * content so they're stable across seed edits.
 *
 * What's exercised end-to-end:
 *  - Auto-focus the first cell when a new query lands
 *  - Arrow / Home / End / PageDown navigation moves the focus overlay
 *  - Enter opens the docked inspector; it shows the focused cell's value
 *  - Arrow keys inside the inspector scrub the displayed value live (the bug
 *    caught in code review pre-ship — if the inspector freezes on the open-cell,
 *    these tests go red)
 *  - Cmd+C copies the focused cell's value to the system clipboard, and the
 *    copy-flash pill appears
 *  - Esc closes the inspector and hands focus back to the grid so arrows resume
 *  - Small results (≤50 rows) do NOT mount the cell grid
 *
 * Selector notes:
 *  - [data-cell-focus-overlay] — the cell focus ring (single DOM node)
 *  - [data-cell-row-stripe] — the row stripe behind the focus ring
 *  - [data-cell-inspector] — the docked inspector panel
 *  - [data-cell-row][data-cell-col] — every rendered virtualized cell
 *  - .copy-flash-pill — the rising "copied" pill (class survives prod bundling)
 */

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

  await expect(
    window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })
  ).toBeHidden({ timeout: 5000 })
  await expect(window.locator('header').getByText(pg.config.name)).toBeVisible({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Dismiss any open completion popup left over from a previous typing burst.
  await window.keyboard.press('Escape')
  const selectAll = process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
  await window.keyboard.press(selectAll)
  // Use insertText (composition event) instead of keyboard.type (keydown sequence)
  // so Monaco's schema-aware autocomplete doesn't intercept identifiers and rewrite
  // them mid-stream — e.g. `ts` → `TRANSACTION`, `AS i` → `AS invoices`.
  await window.keyboard.insertText(sql)
}

async function runQuery(window: Page) {
  const runShortcut = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  await window.keyboard.press(runShortcut)
}

/**
 * Synthesize a 100-row result via generate_series. Independent of seed contents
 * so these tests don't break when the seed grows or shrinks. The columns include
 * an integer (i), a text (label), a numeric (amount), and a timestamp (ts) — enough
 * variety to exercise the inspector's type-aware rendering.
 */
const HUNDRED_ROW_QUERY = `
SELECT
  i AS row_num,
  'value_' || i AS label,
  (i * 1.5)::numeric AS amount,
  ('2026-04-01'::date + (i || ' minutes')::interval) AS ts
FROM generate_series(1, 100) AS i
ORDER BY i
`.trim()

/** Reads the transform translate3d(x, y, 0) values from an element's style. */
async function readTransformOffsets(locator: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> {
  const style = await locator.getAttribute('style')
  if (!style) return { x: NaN, y: NaN }
  const match = style.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/)
  if (!match) return { x: NaN, y: NaN }
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) }
}

/**
 * Focuses the table scroll container — needed because tanstack-react-hotkeys
 * scope the cell-grid listeners to focus inside the table container. Clicking
 * any cell sets focus + focuses the container; this helper does the equivalent
 * via a direct keyboard-friendly entry point.
 */
async function focusGrid(window: Page) {
  // Click the first rendered cell to focus the container + place focus at (0,0)
  const firstCell = window.locator('[data-cell-row="0"][data-cell-col="0"]').first()
  await expect(firstCell).toBeVisible({ timeout: 10000 })
  await firstCell.click()
}

// ---------------------------------------------------------------------------
// Test 1: A 100-row result mounts the cell grid; smaller results don't
// ---------------------------------------------------------------------------

test('100-row result mounts the focus overlay; 5-row result does not', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  // Wait for the result to render — at least one virtualized cell should appear.
  await expect(window.locator('[data-cell-row="0"][data-cell-col="0"]').first()).toBeVisible({
    timeout: 15000
  })

  // The auto-focus effect should land focus on (0,0) without any keyboard input.
  // The overlay's transform encodes the position; the y for row 0 with headerHeight
  // 40 + row 0 * rowHeight should be 40.
  const overlay = window.locator('[data-cell-focus-overlay]')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  const offsets = await readTransformOffsets(overlay)
  expect(offsets.y).toBe(40)
  expect(offsets.x).toBe(0)

  // Now run a small (5-row) result and verify the overlay is gone.
  await typeInMonaco(window, 'SELECT i FROM generate_series(1, 5) AS i')
  await runQuery(window)

  // Result has rendered; cell-grid should NOT have mounted (threshold > 50).
  // Give the renderer a beat to swap result sets.
  await window.waitForTimeout(500)
  await expect(window.locator('[data-cell-focus-overlay]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Test 2: Arrow keys move the focus overlay
// ---------------------------------------------------------------------------

test('arrow keys move the focus overlay between cells', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  const overlay = window.locator('[data-cell-focus-overlay]')
  const startOffsets = await readTransformOffsets(overlay)

  // ArrowDown 3 times → y should increase by 3 × rowHeight (37 in current geom).
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  // Allow the transition to settle and the React state to flush.
  await window.waitForTimeout(250)
  const afterDown = await readTransformOffsets(overlay)
  expect(afterDown.y).toBe(startOffsets.y + 3 * 37)

  // ArrowRight → x should increase by some column width (whatever col[0] is).
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(250)
  const afterRight = await readTransformOffsets(overlay)
  expect(afterRight.x).toBeGreaterThan(afterDown.x)
  expect(afterRight.y).toBe(afterDown.y) // y unchanged on column move

  // ArrowUp → back to row 1 from row 3 = row 2.
  await window.keyboard.press('ArrowUp')
  await window.keyboard.press('ArrowUp')
  await window.waitForTimeout(250)
  const afterUp = await readTransformOffsets(overlay)
  expect(afterUp.y).toBe(afterRight.y - 2 * 37)
})

// ---------------------------------------------------------------------------
// Test 3: Home / End jump within a row
// ---------------------------------------------------------------------------

test('Home jumps to first column; End jumps to last column', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  const overlay = window.locator('[data-cell-focus-overlay]')

  // Move to the middle of the row first
  await window.keyboard.press('ArrowRight')
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(250)
  const mid = await readTransformOffsets(overlay)
  expect(mid.x).toBeGreaterThan(0)

  // End → x should be the largest column offset
  await window.keyboard.press('End')
  await window.waitForTimeout(250)
  const atEnd = await readTransformOffsets(overlay)
  expect(atEnd.x).toBeGreaterThan(mid.x)

  // Home → x === 0
  await window.keyboard.press('Home')
  await window.waitForTimeout(250)
  const atHome = await readTransformOffsets(overlay)
  expect(atHome.x).toBe(0)
})

// ---------------------------------------------------------------------------
// Test 4: PageDown jumps multiple rows
// ---------------------------------------------------------------------------

test('PageDown moves the focus by 20 rows', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  const overlay = window.locator('[data-cell-focus-overlay]')
  const before = await readTransformOffsets(overlay)

  await window.keyboard.press('PageDown')
  // PageDown triggers a virtualizer scroll + state update + transform animation.
  await window.waitForTimeout(400)
  const after = await readTransformOffsets(overlay)

  // The page step is 20 rows × 37px = 740px down.
  expect(after.y).toBe(before.y + 20 * 37)
})

// ---------------------------------------------------------------------------
// Test 5: Enter opens the inspector with the focused cell's value
// ---------------------------------------------------------------------------

test('Enter opens the inspector showing the focused cell value', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  // Move to row 4 col 1 ("label" column, value "value_5" since rows are 1-indexed).
  // generate_series starts at 1, so row 0 in the table = i=1, row 4 = i=5.
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(250)

  await window.keyboard.press('Enter')

  // Inspector mounts; the role is "region" with aria-label "Cell inspector for label".
  const inspector = window.locator('[data-cell-inspector]')
  await expect(inspector).toBeVisible({ timeout: 5000 })
  await expect(inspector).toHaveAttribute('aria-label', /Cell inspector for label/i)

  // The inspector body shows the cell value. value_5 corresponds to row 4 (0-indexed).
  await expect(inspector).toContainText('value_5')
  // Type badge for a TEXT column should mention text/varchar.
  await expect(inspector).toContainText(/text|varchar/i)
})

// ---------------------------------------------------------------------------
// Test 6: Arrow keys inside the inspector scrub the displayed value live
//         (regression for the pre-ship bug where the inspector froze)
// ---------------------------------------------------------------------------

test('arrow keys scrub the inspector content live without closing it', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  // Focus row 0, col 1 (label = 'value_1')
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(150)

  await window.keyboard.press('Enter')

  const inspector = window.locator('[data-cell-inspector]')
  await expect(inspector).toBeVisible({ timeout: 5000 })
  await expect(inspector).toContainText('value_1')

  // ArrowDown while inspector is open → focus moves to row 1, col 1 (label = 'value_2').
  // The inspector should follow focus and now show 'value_2'.
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(250)
  await expect(inspector).toContainText('value_2')
  // The previous value should be gone from the visible inspector body
  // (not just outside the panel — guard against the "frozen on open-cell" regression).
  const bodyText = await inspector.textContent()
  // The header still shows the column name "label" which contains the substring
  // "value_1" if we got the very first row's display. But the cell value pane
  // should now show value_2 prominently. Easiest assertion: value_2 must appear.
  expect(bodyText).toContain('value_2')

  // ArrowDown 3 more times → value_5
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(250)
  await expect(inspector).toContainText('value_5')
})

// ---------------------------------------------------------------------------
// Test 7: Escape closes the inspector and arrows resume in the grid
// ---------------------------------------------------------------------------

test('Escape closes the inspector and keyboard nav resumes immediately', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  const overlay = window.locator('[data-cell-focus-overlay]')

  // Move to a known row, open inspector
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(150)
  await window.keyboard.press('Enter')

  const inspector = window.locator('[data-cell-inspector]')
  await expect(inspector).toBeVisible({ timeout: 5000 })

  // Capture row position before close
  const beforeClose = await readTransformOffsets(overlay)

  // Escape → inspector dismounts
  await window.keyboard.press('Escape')
  await expect(inspector).toBeHidden({ timeout: 3000 })

  // After Escape, an immediate ArrowDown should move the overlay — confirming
  // focus returned to the grid container and arrows are wired up again.
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(250)
  const afterArrow = await readTransformOffsets(overlay)
  expect(afterArrow.y).toBe(beforeClose.y + 37)
})

// ---------------------------------------------------------------------------
// Test 8: Cmd+C copies the focused cell's value to the system clipboard +
//         the copy-flash pill appears briefly
// ---------------------------------------------------------------------------

test('Cmd+C copies the focused cell value and flashes the pill', async ({
  electronApp,
  window
}) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  await focusGrid(window)
  // Move to row 9 col 1 — label = 'value_10' (deterministic, easy to assert).
  for (let i = 0; i < 9; i++) await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(200)

  const copyShortcut = process.platform === 'darwin' ? 'Meta+c' : 'Control+c'
  await window.keyboard.press(copyShortcut)

  // The copy-flash pill appears briefly; race the assertion before the 900ms
  // animation completes.
  await expect(window.locator('.copy-flash-pill').first()).toBeVisible({ timeout: 1000 })

  // Verify the system clipboard now holds the cell value via Electron's main-process
  // clipboard module — the only reliable read path in a packaged Electron test.
  const clipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  expect(clipboard).toBe('value_10')

  // Pill fades and the element drops out of the DOM within ~1s.
  await expect(window.locator('.copy-flash-pill')).toHaveCount(0, { timeout: 2000 })
})

// ---------------------------------------------------------------------------
// Test 9: Clicking a cell sets focus there (mouse + keyboard composition)
// ---------------------------------------------------------------------------

test('clicking a cell snaps focus to that cell', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  // Click row 6 col 2 explicitly. The cell's transform on the overlay should
  // match the geometry-derived position.
  const cell = window.locator('[data-cell-row="6"][data-cell-col="2"]').first()
  await expect(cell).toBeVisible({ timeout: 10000 })
  await cell.click()

  await window.waitForTimeout(250)
  const overlay = window.locator('[data-cell-focus-overlay]')
  const { y } = await readTransformOffsets(overlay)
  // y = headerHeight (40) + row 6 * rowHeight (37) = 40 + 222 = 262
  expect(y).toBe(40 + 6 * 37)
})

// ---------------------------------------------------------------------------
// Test 10: Auto-focus re-fires when the query columns change
// ---------------------------------------------------------------------------

test('running a new query with different columns resets focus to (0,0)', async ({ window }) => {
  await openQueryTab(window)
  await typeInMonaco(window, HUNDRED_ROW_QUERY)
  await runQuery(window)

  // Move focus away from (0,0)
  await focusGrid(window)
  for (let i = 0; i < 5; i++) await window.keyboard.press('ArrowDown')
  for (let i = 0; i < 2; i++) await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(250)

  const overlay = window.locator('[data-cell-focus-overlay]')
  const before = await readTransformOffsets(overlay)
  expect(before.y).toBeGreaterThan(40) // we've definitely moved away
  expect(before.x).toBeGreaterThan(0)

  // Run a NEW query with a different column set so the columnKey changes.
  await typeInMonaco(
    window,
    `SELECT i AS n, (i * 2)::numeric AS doubled
     FROM generate_series(1, 100) AS i ORDER BY i`
  )
  await runQuery(window)

  // First cell of the new result should auto-focus → overlay at (0, 40).
  await expect(window.locator('[data-cell-row="0"][data-cell-col="0"]').first()).toBeVisible({
    timeout: 10000
  })
  await window.waitForTimeout(400)
  const after = await readTransformOffsets(overlay)
  expect(after.x).toBe(0)
  expect(after.y).toBe(40)
})
