import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * UI-driven coverage for AddConnectionDialog. The IPC-level connection tests
 * live in connections.spec.ts; this one proves the renderer wires up the form
 * to those IPCs end-to-end.
 *
 * Note: data-testid attributes on Radix UI portal elements (SheetContent) are
 * stripped in the production build. We use data-slot="sheet-content" and
 * accessible-name selectors instead. The Test/Save buttons (standard HTML
 * <button>) also lose data-testid in the production bundle, so we target them
 * by visible text.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Page = import('@playwright/test').Page

/**
 * Open the AddConnectionDialog from the ConnectionSwitcher.
 *
 * When there are no saved connections the switcher renders a plain "Add
 * connection" SidebarMenuButton. When connections are present it renders a
 * dropdown — we open the dropdown first, then click the "Add connection"
 * DropdownMenuItem inside it.
 */
async function openAddDialog(window: Page) {
  // Wait for the sidebar to finish initialising (the Loader2 spinner disappears).
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 5000 })

  // If we see the plain "Add connection" button (no-connections state) use it directly.
  const plainAdd = window.getByRole('button', { name: /add connection/i })
  if (await plainAdd.isVisible()) {
    await plainAdd.click()
  } else {
    // Connections exist — open the dropdown trigger first.
    await window.locator('[data-sidebar="menu-button"]').first().click()
    // Then click "Add connection" inside the dropdown.
    await window.getByRole('menuitem', { name: /add connection/i }).click()
  }

  // SheetContent is portalled to <body>; data-slot="sheet-content" survives
  // the production build whereas data-testid is stripped.
  await expect(window.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5000 })
}

/** Locate the currently-open Sheet dialog panel. */
function dialog(window: Page) {
  return window.locator('[data-slot="sheet-content"]')
}

/**
 * Fill all the manual-mode connection fields from a config object.
 */
async function fillConnectionForm(
  window: Page,
  cfg: {
    name: string
    host: string
    port: number
    database: string
    user: string
    password: string
  }
) {
  const d = dialog(window)

  // Clear then fill the Connection Name field
  await d.locator('#name').clear()
  await d.locator('#name').fill(cfg.name)

  // Host
  await d.locator('#host').clear()
  await d.locator('#host').fill(cfg.host)

  // Port — clear first because the input starts with a default value
  await d.locator('#port').clear()
  await d.locator('#port').fill(String(cfg.port))

  // Database
  await d.locator('#database').clear()
  await d.locator('#database').fill(cfg.database)

  // Username
  await d.locator('#user').clear()
  await d.locator('#user').fill(cfg.user)

  // Password
  await d.locator('#password').clear()
  await d.locator('#password').fill(cfg.password)
}

// ---------------------------------------------------------------------------
// Test 1: Happy path — fill, test, save → connection persists
// ---------------------------------------------------------------------------

test('fill, test-connection, save → connection appears in connections.list', async ({ window }) => {
  await openAddDialog(window)

  await fillConnectionForm(window, {
    name: pg.config.name,
    host: pg.config.host,
    port: pg.config.port,
    database: pg.config.database,
    user: pg.config.user,
    password: pg.config.password
  })

  // Click the Test Connection button (targeted by visible label text)
  await dialog(window).getByRole('button', { name: 'Test Connection' }).click()

  // Expect a success banner to appear inside the sheet
  await expect(
    dialog(window).getByText(/connection successful|connected|success/i)
  ).toBeVisible({ timeout: 10000 })

  // Save
  await dialog(window).getByRole('button', { name: /save connection/i }).click()

  // Dialog must close
  await expect(window.locator('[data-slot="sheet-content"]')).toBeHidden({ timeout: 5000 })

  // Verify the connection was persisted via IPC
  const listResult = await window.evaluate(async () => window.api.connections.list())
  expect(listResult.success).toBe(true)
  const names = (listResult.data ?? []).map((c: { name: string }) => c.name)
  expect(names).toContain(pg.config.name)
})

// ---------------------------------------------------------------------------
// Test 2: Bad credentials surface a visible error
// ---------------------------------------------------------------------------

test('wrong password → test connection shows an error', async ({ window }) => {
  await openAddDialog(window)

  await fillConnectionForm(window, {
    name: 'bad-creds-' + pg.config.name,
    host: pg.config.host,
    port: pg.config.port,
    database: pg.config.database,
    user: pg.config.user,
    password: 'definitely-wrong-password'
  })

  // Click Test and expect an error banner inside the sheet
  await dialog(window).getByRole('button', { name: 'Test Connection' }).click()

  await expect(
    dialog(window).getByText(/authentication failed|password|connection failed|error/i)
  ).toBeVisible({ timeout: 10000 })

  // Do NOT save — the fixture tears down the Electron app after this test.
})
