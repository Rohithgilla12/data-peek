import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * Find in the results grid, the cell grid on small (non-virtualized) results,
 * and Copy Selection As. Overlay alignment is asserted against the rendered
 * cells' bounding boxes, so a drift between geometry and layout fails here.
 */

type Page = import('@playwright/test').Page
type Locator = import('@playwright/test').Locator

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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
})

async function runSql(window: Page, sql: string) {
  await window.keyboard.press(`${MOD}+Shift+t`)
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })
  await window.locator('.monaco-editor').first().click()
  await window.keyboard.press('Escape')
  await window.keyboard.press(`${MOD}+a`)
  await window.keyboard.insertText(sql)
  await window.keyboard.press(`${MOD}+Enter`)
}

function cell(window: Page, row: number, col: number): Locator {
  return window.locator(`[data-cell-row="${row}"][data-cell-col="${col}"]`).first()
}

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('element has no bounding box')
  return b
}

/** The overlay must cover exactly the cells from `from` to `to`, within a pixel. */
async function expectCovers(overlay: Locator, from: Locator, to: Locator) {
  await expect(async () => {
    const o = await box(overlay)
    const a = await box(from)
    const b = await box(to)
    const edges = {
      left: o.x - a.x,
      top: o.y - a.y,
      right: o.x + o.width - (b.x + b.width),
      bottom: o.y + o.height - (b.y + b.height)
    }
    for (const [edge, drift] of Object.entries(edges)) {
      expect(
        Math.abs(drift),
        `${edge} edge drift ${JSON.stringify({ o, a, b })}`
      ).toBeLessThanOrEqual(1)
    }
  }).toPass({ timeout: 3000 })
}

/**
 * Taking a screenshot restarts the focus ring's 160ms transform transition, so
 * without `animations: 'disabled'` the capture shows the ring mid-flight.
 */
async function screenshotGrid(window: Page, name: string) {
  await window.screenshot({
    path: test.info().outputPath(name),
    clip: await box(window.locator('[data-cell-grid]')),
    animations: 'disabled'
  })
}

const TEN_ROWS = `
SELECT i AS n,
  CASE WHEN i IN (2, 7) THEN 'needle_' || i ELSE 'hay_' || i END AS label,
  (i * 10)::int AS amount,
  'secret_' || i AS token
FROM generate_series(1, 10) AS i
ORDER BY i
`.trim()

// 150 rows over the default page size of 100, with matches either side of the
// page boundary.
const PAGED_ROWS = `
SELECT i AS n,
  CASE WHEN i IN (3, 99, 101) THEN 'needle' ELSE 'hay_' || i END AS label
FROM generate_series(1, 150) AS i
ORDER BY i
`.trim()

test('a 10-row result supports click, Shift+arrow selection, and stats', async ({ window }) => {
  await runSql(window, TEN_ROWS)
  await expect(cell(window, 9, 3)).toBeVisible({ timeout: 15000 })

  await cell(window, 1, 0).click()
  const focus = window.locator('[data-cell-focus-overlay]')
  await expectCovers(focus, cell(window, 1, 0), cell(window, 1, 0))

  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowRight')
  await window.keyboard.press('Shift+ArrowRight')

  const rect = window.locator('[data-cell-selection-rect]')
  await expect(rect).toHaveCount(1)
  await expectCovers(rect, cell(window, 1, 0), cell(window, 3, 2))

  const stats = window.getByTestId('cell-selection-stats')
  await expect(stats).toContainText('Selected: 9 cells')
  // n 2..4 and amount 20..40 are the numeric cells: 9 + 90 = 99.
  await expect(stats).toContainText('Sum: 99')

  // The last row lines up too, so row heights don't drift down the table.
  await cell(window, 9, 3).click()
  await expectCovers(focus, cell(window, 9, 3), cell(window, 9, 3))

  await cell(window, 0, 0).click()
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowRight')
  await window.keyboard.press(`${MOD}+f`)
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('needle')
  await expect(window.getByTestId('cell-find-count')).toHaveText('2 matches')
  const matches = window.locator('[data-cell-find-match]')
  await expect(matches).toHaveCount(2)
  await expectCovers(matches.nth(0), cell(window, 1, 1), cell(window, 1, 1))
  await expectCovers(matches.nth(1), cell(window, 6, 1), cell(window, 6, 1))
  await screenshotGrid(window, 'small-result-selection-and-find.png')
})

test('Mod+F opens find inside the grid and focuses the filter elsewhere', async ({ window }) => {
  await runSql(window, TEN_ROWS)
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })

  await cell(window, 0, 0).click()
  await window.keyboard.press(`${MOD}+f`)
  const findInput = window.getByRole('textbox', { name: 'Find in grid' })
  await expect(findInput).toBeFocused()
  const filterInput = window.locator('input[placeholder="Type column name or search all..."]')
  await expect(filterInput).toHaveCount(0)

  await window.keyboard.press('Escape')
  await expect(window.getByTestId('cell-find-bar')).toHaveCount(0)
  // Escape hands focus back to the grid, so arrows drive the focus ring again.
  await window.keyboard.press('ArrowDown')
  await expectCovers(
    window.locator('[data-cell-focus-overlay]'),
    cell(window, 1, 0),
    cell(window, 1, 0)
  )

  // Focus outside any grid: Mod+F goes to the Smart Filter bar.
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await window.keyboard.press(`${MOD}+f`)
  await expect(filterInput).toBeFocused()
  await expect(window.getByTestId('cell-find-bar')).toHaveCount(0)
})

test('Enter walks find matches across a page boundary', async ({ window }) => {
  await runSql(window, PAGED_ROWS)
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })

  await cell(window, 0, 0).click()
  await window.keyboard.press(`${MOD}+f`)
  const findInput = window.getByRole('textbox', { name: 'Find in grid' })
  await findInput.fill('needle')
  const count = window.getByTestId('cell-find-count')
  await expect(count).toHaveText('3 matches')

  const focus = window.locator('[data-cell-focus-overlay]')
  const current = window.locator('[data-cell-find-match="current"]')

  await findInput.press('Enter')
  await expect(count).toHaveText('1 of 3')
  await expect(cell(window, 2, 1)).toHaveText('needle')
  await expectCovers(focus, cell(window, 2, 1), cell(window, 2, 1))
  await expectCovers(current, cell(window, 2, 1), cell(window, 2, 1))

  await findInput.press('Enter')
  await expect(count).toHaveText('2 of 3')
  await expect(cell(window, 98, 1)).toHaveText('needle')
  await expectCovers(focus, cell(window, 98, 1), cell(window, 98, 1))

  // Row 101 is the first row of page 2.
  await findInput.press('Enter')
  await expect(count).toHaveText('3 of 3')
  await expect(cell(window, 0, 0)).toHaveText('101')
  await expect(cell(window, 0, 1)).toHaveText('needle')
  await expectCovers(focus, cell(window, 0, 1), cell(window, 0, 1))
  await expectCovers(current, cell(window, 0, 1), cell(window, 0, 1))

  // Wraps back to the first match on page 1, and Shift+Enter walks backwards.
  await findInput.press('Enter')
  await expect(count).toHaveText('1 of 3')
  await expect(cell(window, 0, 0)).toHaveText('1')
  await findInput.press('Shift+Enter')
  await expect(count).toHaveText('3 of 3')
  await expect(cell(window, 0, 0)).toHaveText('101')

  await window.keyboard.press(`${MOD}+g`)
  await expect(count).toHaveText('1 of 3')
  await window.keyboard.press(`${MOD}+Shift+g`)
  await expect(count).toHaveText('3 of 3')

  // A selection on the virtualized path, with the find highlight still showing.
  await findInput.press('Shift+Enter')
  await expect(count).toHaveText('2 of 3')
  await cell(window, 95, 0).click()
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowDown')
  await cell(window, 99, 1).scrollIntoViewIfNeeded()
  await expectCovers(
    window.locator('[data-cell-selection-rect]'),
    cell(window, 95, 0),
    cell(window, 97, 0)
  )
  await expectCovers(current, cell(window, 98, 1), cell(window, 98, 1))
  await screenshotGrid(window, 'paged-result-selection-and-find.png')
})

test('invalid regex shows inline instead of throwing', async ({ window }) => {
  await runSql(window, TEN_ROWS)
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })
  await cell(window, 0, 0).click()
  await window.keyboard.press(`${MOD}+f`)
  await window.getByRole('button', { name: 'Use Regular Expression' }).click()
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('needle_(')
  await expect(window.getByTestId('cell-find-bar')).toContainText('Invalid regex')
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('needle_[27]$')
  await expect(window.getByTestId('cell-find-count')).toHaveText('2 matches')
})

test('Copy Selection As CSV puts the selection with headers on the clipboard', async ({
  window,
  electronApp
}) => {
  await runSql(window, TEN_ROWS)
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })

  await cell(window, 0, 0).click()
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowRight')

  // Outside the selection the submenu is not offered.
  await cell(window, 5, 3).click({ button: 'right' })
  await expect(window.getByRole('menuitem', { name: 'Copy Row as JSON' })).toBeVisible()
  await expect(window.getByRole('menuitem', { name: 'Copy Selection As' })).toHaveCount(0)
  await window.keyboard.press('Escape')

  await cell(window, 1, 1).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Copy Selection As' }).click()
  await window.getByRole('menuitem', { name: 'CSV', exact: true }).click()

  await expect
    .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('n,label\n1,hay_1\n2,needle_2')
  await expect(window.locator('.copy-flash-pill')).toContainText('copied 4 cells (CSV)')

  // Mod+C stays plain TSV without headers.
  await cell(window, 0, 0).click()
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowRight')
  await window.keyboard.press(`${MOD}+c`)
  await expect
    .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('1\thay_1\n2\tneedle_2')
})

test('masked columns copy as empty and never match find', async ({ window, electronApp }) => {
  await runSql(window, TEN_ROWS)
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })

  // The default auto-mask rules already mask a column named "token".
  await window.getByTestId('column-stats-trigger-token').click()
  await expect(window.getByRole('menuitem', { name: 'Unmask Column' })).toBeVisible()
  await window.keyboard.press('Escape')

  await cell(window, 0, 2).click()
  await window.keyboard.press('Shift+ArrowDown')
  await window.keyboard.press('Shift+ArrowRight')
  await window.keyboard.press(`${MOD}+c`)
  await expect
    .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('10\t\n20\t')

  await cell(window, 0, 3).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Copy Selection As' }).click()
  await window.getByRole('menuitem', { name: 'JSON', exact: true }).click()
  await expect
    .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
    .not.toContain('secret_')

  await cell(window, 0, 0).click()
  await window.keyboard.press(`${MOD}+f`)
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('secret_')
  await expect(window.getByTestId('cell-find-bar')).toContainText('No matches')
})

/**
 * Every painted match in view must sit exactly on a cell whose text contains
 * the needle. Works without knowing the seed's row order.
 */
async function expectMatchesOnCells(window: Page, needle: string) {
  const drift = await window.evaluate((n) => {
    const problems: string[] = []
    const viewport = document
      .querySelector<HTMLElement>('[data-cell-grid] > .overflow-auto')!
      .getBoundingClientRect()
    let checked = 0
    for (const overlay of document.querySelectorAll<HTMLElement>('[data-cell-find-match]')) {
      const o = overlay.getBoundingClientRect()
      const cx = o.x + o.width / 2
      const cy = o.y + o.height / 2
      // Rows under the sticky header or scrolled out of view can't be hit-tested.
      if (cx < viewport.left || cx > viewport.right || cy < viewport.top + 45) continue
      if (cy > viewport.bottom) continue
      checked++
      const under = document
        .elementsFromPoint(cx, cy)
        .map((el) => el.closest<HTMLElement>('[data-cell-row][data-cell-col]'))
        .find((el) => el !== null)
      if (!under) {
        problems.push('no cell under a match')
        continue
      }
      const c = under.getBoundingClientRect()
      const edges = [o.x - c.x, o.y - c.y, o.right - c.right, o.bottom - c.bottom]
      if (edges.some((e) => Math.abs(e) > 1)) problems.push(`drift ${edges.join(',')}`)
      if (!under.textContent?.toLowerCase().includes(n)) {
        problems.push(`cell "${under.textContent}" does not contain ${n}`)
      }
    }
    return { count: checked, problems }
  }, needle)
  expect(drift.count).toBeGreaterThan(0)
  expect(drift.problems).toEqual([])
}

test('editable table: overlays align with FK, JSON, and enum cells, in and out of edit mode', async ({
  window
}) => {
  await runSql(window, 'SELECT * FROM projects ORDER BY name')
  await expect(cell(window, 0, 0)).toBeVisible({ timeout: 15000 })
  const rowCount = await window.locator('[data-cell-col="0"]').count()
  const last = rowCount - 1

  const focus = window.locator('[data-cell-focus-overlay]')
  await cell(window, last, 4).click()
  await expectCovers(focus, cell(window, last, 4), cell(window, last, 4))

  await window.keyboard.press(`${MOD}+f`)
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('active')
  await expect(window.locator('[data-cell-find-match]').first()).toBeVisible()
  await expectMatchesOnCells(window, 'active')
  await screenshotGrid(window, 'editable-find.png')
  await window.keyboard.press('Escape')

  await window.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Exit Edit' })).toBeVisible()
  // Edit mode prepends a select column, so the grid's column 1 is the first data column.
  await cell(window, last, 5).click()
  await expectCovers(focus, cell(window, last, 5), cell(window, last, 5))
  await window.keyboard.press(`${MOD}+f`)
  await window.getByRole('textbox', { name: 'Find in grid' }).fill('active')
  await expectMatchesOnCells(window, 'active')
  await screenshotGrid(window, 'editable-edit-mode-find.png')
})
