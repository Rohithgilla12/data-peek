import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './fixtures/electron-app'

/**
 * Native menu items send `menu:*` IPC events to the renderer; these specs click
 * the real menu items and assert the renderer reacts. No database is needed:
 * the connection points at a closed port, and the query specs replace the
 * `db:query-with-telemetry` handler with a stub that records the SQL it receives.
 */

const DEAD_CONNECTION = {
  id: 'e2e-menu-items',
  name: 'menu-items-dead-conn',
  dbType: 'postgresql' as const,
  host: '127.0.0.1',
  port: 1,
  database: 'postgres',
  user: 'postgres',
  password: '',
  ssl: false as const,
  dstPort: 1
}

async function clickMenuItem(app: ElectronApplication, label: string): Promise<void> {
  // menu.ts handlers send to BrowserWindow.getFocusedWindow(), so the click is a
  // no-op until the window actually has focus.
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        win?.focus()
        return BrowserWindow.getFocusedWindow() !== null
      })
    )
    .toBe(true)
  const found = await app.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.label === label) return item
        const nested = item.submenu && find(item.submenu.items)
        if (nested) return nested
      }
      return undefined
    }
    const item = find(Menu.getApplicationMenu()?.items ?? [])
    item?.click()
    return Boolean(item)
  }, label)
  expect(found, `menu item "${label}" exists`).toBe(true)
}

type MenuAccelerators = Record<string, string | undefined>

async function menuAccelerators(app: ElectronApplication): Promise<MenuAccelerators> {
  return app.evaluate(({ Menu }) => {
    const out: Record<string, string | undefined> = {}
    const walk = (items: Electron.MenuItem[]): void => {
      for (const item of items) {
        if (item.label) out[item.label] = item.accelerator ?? undefined
        if (item.submenu) walk(item.submenu.items)
      }
    }
    walk(Menu.getApplicationMenu()?.items ?? [])
    return out
  })
}

/** Replace the editor's query handler so runs fail with `ran: <sql>` and the SQL is recorded. */
async function stubQueryHandler(app: ElectronApplication): Promise<() => Promise<string[]>> {
  await app.evaluate(({ ipcMain }) => {
    const ran: string[] = []
    ;(globalThis as { __ranQueries?: string[] }).__ranQueries = ran
    ipcMain.removeHandler('db:query-with-telemetry')
    ipcMain.handle('db:query-with-telemetry', (_event, { query }: { query: string }) => {
      ran.push(query)
      return { success: false, error: `ran: ${query}` }
    })
  })
  return () =>
    app.evaluate(() => [...((globalThis as { __ranQueries?: string[] }).__ranQueries ?? [])])
}

// exact: the tab itself is a button whose accessible name also contains "Close tab"
const closeTabButtons = (window: Page) =>
  window.getByRole('button', { name: 'Close tab', exact: true })

test('File > New Tab and File > Close Tab open and close a tab', async ({
  electronApp,
  window
}) => {
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  const before = await closeTabButtons(window).count()

  await clickMenuItem(electronApp, 'New Tab')
  await expect(closeTabButtons(window)).toHaveCount(before + 1)

  await clickMenuItem(electronApp, 'Close Tab')
  await expect(closeTabButtons(window)).toHaveCount(before)
})

test('menu accelerators match the editor and do not collide', async ({ electronApp, window }) => {
  // The app replaces Electron's default menu once the renderer is up.
  await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
  await expect
    .poll(async () => (await menuAccelerators(electronApp))['New Tab'])
    .toBe('CmdOrCtrl+T')
  const accelerators = await menuAccelerators(electronApp)
  expect(accelerators['Format SQL']).toBe('CmdOrCtrl+Shift+F')
  // Cmd/Ctrl+K belongs to the Command Palette.
  expect(accelerators['Clear Results']).toBe('CmdOrCtrl+Shift+Backspace')

  const seen = new Map<string, string>()
  for (const [label, accelerator] of Object.entries(accelerators)) {
    if (!accelerator) continue
    expect(seen.get(accelerator), `${label} reuses ${accelerator}`).toBeUndefined()
    seen.set(accelerator, label)
  }
})

test.describe('Query menu', () => {
  test.beforeEach(async ({ electronApp, window }) => {
    await window.evaluate((cfg) => window.api.connections.add(cfg), DEAD_CONNECTION)
    await expect(window.getByText('Loading...')).toBeHidden({ timeout: 8000 })
    await window.locator('[data-sidebar="menu-button"]').first().click()
    const item = window.locator('[role="menuitem"]').filter({ hasText: DEAD_CONNECTION.name })
    await expect(item).toBeVisible({ timeout: 8000 })
    await item.click()
    await expect(item).toBeHidden({ timeout: 5000 })
    await expect(window.locator('header').getByText(DEAD_CONNECTION.name)).toBeVisible({
      timeout: 5000
    })
    // The restored tab predates the connection; open one bound to it.
    await clickMenuItem(electronApp, 'New Tab')
    await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
  })

  async function typeQuery(window: Page, sql: string): Promise<void> {
    await window.locator('.monaco-editor').first().click()
    await window.keyboard.type(sql)
  }

  const editorText = (window: Page) =>
    window.locator('.monaco-editor .view-lines').first().innerText()

  test('Query > Format SQL formats the active editor', async ({ electronApp, window }) => {
    await typeQuery(window, 'select id, name from users where id = 1')
    const before = await editorText(window)

    await clickMenuItem(electronApp, 'Format SQL')
    await expect.poll(() => editorText(window)).not.toBe(before)
    await expect.poll(() => editorText(window)).toContain('SELECT')
  })

  test('Query > Execute Query runs and Query > Clear Results clears', async ({
    electronApp,
    window
  }) => {
    const ranQueries = await stubQueryHandler(electronApp)
    await typeQuery(window, 'select 1')

    await clickMenuItem(electronApp, 'Execute Query')
    const result = window.getByText('ran: select 1')
    await expect(result).toBeVisible({ timeout: 15_000 })
    expect(await ranQueries()).toEqual(['select 1'])

    await clickMenuItem(electronApp, 'Clear Results')
    await expect(result).toBeHidden()
  })

  test('Query > Execute Query runs only the selection when there is one', async ({
    electronApp,
    window
  }) => {
    const ranQueries = await stubQueryHandler(electronApp)
    await typeQuery(window, 'select 1;')
    await window.keyboard.press('Enter')
    await window.keyboard.type('select 2;')
    // Cursor is at the end of line 2; select back to its start.
    await window.keyboard.press('Shift+Home')

    await clickMenuItem(electronApp, 'Execute Query')
    await expect(window.getByText('ran: select 2;')).toBeVisible({ timeout: 15_000 })
    expect(await ranQueries()).toEqual(['select 2;'])
  })
})
