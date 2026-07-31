import { Client } from 'pg'
import { test, expect } from './fixtures/recording-app'

/**
 * Films Watch Mode: a pinned SELECT re-running on a cadence, with the amber
 * changed-cell background that is the feature's whole visual signature.
 *
 * This spec was written to fail. It was the acceptance test for Watch Mode Bug 2 —
 * diff decoration gated behind `shouldVirtualize` in both grids, so nothing rendered
 * at or below 50 rows — and it sat in the repo deliberately red until that was fixed
 * (see notes/_watch-mode-bugs.md). It now passes unchanged, which is the evidence
 * that the fix works.
 *
 * Two assertions, deliberately separate, because they cover different bugs:
 * the `(Live)` text proves cell values repaint on a tick (Bug 1), and the
 * `--cell-diff-fill` style proves the change is actually highlighted (Bug 2).
 * Passing the first without the second is exactly the state this project shipped in
 * once — a feature that told you a cell changed while showing you the old value.
 */

interface PgConnectionDetails {
  host: string
  port: number
  database: string
  user: string
  password: string
}

/**
 * Watch Mode only re-renders a diff when the underlying data actually changes
 * between ticks, so the seeded (static) dataset needs a real mutation mid-clip
 * or the "Watching" state would just sit there with nothing to show.
 */
async function mutateWatchedRow(config: PgConnectionDetails): Promise<void> {
  const client = new Client(config)
  await client.connect()
  // email is UNIQUE (seeds/acme_saas_seed.sql), so ORDER BY email LIMIT 1 always
  // resolves to the same row as the displayed query's ORDER BY email LIMIT 3 —
  // this mutates the first of the three visible rows, not some other row.
  await client.query(
    "UPDATE users SET name = name || ' (Live)' WHERE email = (SELECT email FROM users ORDER BY email LIMIT 1) RETURNING email, name"
  )
  await client.end()
}

test('watch-mode', async ({ window, cursor, pg }) => {
  // Watch Mode needs a live connection to poll, so select the seeded connection
  // before doing anything else — the harness only adds it, it never selects it.
  await cursor.click('[data-sidebar="menu-button"]')
  const connectionItem = window.locator('[role="menuitem"]').filter({ hasText: pg.config.name })
  await expect(connectionItem).toBeVisible({ timeout: 8000 })
  await cursor.click(`[role="menuitem"]:has-text("${pg.config.name}")`)
  await expect(window.locator('header').getByText(pg.config.name)).toBeVisible({ timeout: 5000 })
  await window.waitForTimeout(500)

  const newQueryBtn = window.getByRole('button', { name: /new query/i })
  if (await newQueryBtn.isVisible()) {
    await cursor.click('button:has-text("New Query")')
  } else {
    await cursor.press('Meta+t')
  }
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(500)

  await cursor.click('.monaco-editor')
  await cursor.type('SELECT id, email, name FROM users ORDER BY email LIMIT 3')
  await window.waitForTimeout(700)

  await cursor.press('Meta+Enter')
  await expect(window.locator('tbody tr')).toHaveCount(3, { timeout: 15000 })
  await window.waitForTimeout(900)

  // Watch Mode only decorates an already-populated results table — the query
  // must be run before starting the watch (tests/e2e/watch-mode.spec.ts). At
  // this point in the flow only the idle "Watch" button exists (not yet
  // "Watching…"), so a substring match is unambiguous.
  await cursor.click('button:has-text("Watch")')
  await expect(window.getByText(/Watching/).first()).toBeVisible({ timeout: 8000 })

  // The scheduler fires an immediate baseline tick on start, then ticks again on
  // the default 5s cadence. Mutate right after the baseline lands so the next
  // tick has something to diff, then hold through it.
  await window.waitForTimeout(600)
  await mutateWatchedRow(pg.config)

  // The whole pitch of this clip is a live cell-level diff — a capture that
  // never reaches that state must fail, not emit footage of a static table.
  await expect(window.getByText(/\(Live\)/).first()).toBeVisible({ timeout: 15000 })

  // The actual decoration, not just the changed text: WatchDecorationOverlay
  // paints a changed cell with `background: var(--cell-diff-fill, ...)` as an
  // inline style (cell-grid/watch-decoration-overlay.tsx). This is Bug 2's
  // acceptance check — see the file header. It is expected to fail with a
  // 3-row result until Bug 2 is fixed.
  await expect(window.locator('[style*="--cell-diff-fill"]').first()).toBeVisible({
    timeout: 8000
  })
  await window.waitForTimeout(6000)

  // The toolbar toggle opens the "Watching" popover rather than stopping the
  // watch directly (see WatchButton.handleToggle) — open it, then stop from
  // inside. The popover can land outside Playwright's tracked viewport near the
  // right edge, so dispatch the click via the DOM instead of a real pointer
  // click (tests/e2e/watch-mode.spec.ts documents the same workaround).
  await cursor.click('button[data-watch-active]')
  const stopBtn = window.getByRole('button', { name: /Stop/i })
  await expect(stopBtn).toBeVisible({ timeout: 5000 })
  await cursor.moveTo('button:has-text("Stop")')
  await stopBtn.dispatchEvent('click')
  await expect(window.getByRole('button', { name: 'Watch', exact: true })).toBeVisible({
    timeout: 5000
  })
  await window.waitForTimeout(1200)
})
