import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Path to the built main-process bundle. Tests assume `pnpm build` has produced this;
 * `pnpm test:e2e` runs the build first via the npm script, but if you invoke the
 * Playwright CLI directly you'll get a clear error pointing here.
 */
const MAIN_ENTRY = resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')

interface ElectronFixtures {
  /** The Electron app instance — `electronApp.close()` is handled in fixture teardown. */
  electronApp: ElectronApplication
  /** The first BrowserWindow's renderer page. */
  window: Page
  /** Temp directory used as `--user-data-dir`; cleaned up after the test. */
  userDataDir: string
  /**
   * Returns the renderer console errors observed since the test started — including
   * errors emitted during the initial mount, before `window` resolves. Use this
   * instead of attaching `window.on('console', …)` inside a test, which races the
   * mount and can miss white-screen regressions.
   */
  consoleErrors: () => string[]
}

/**
 * Boots the real Electron app per test with isolated `userData`, so persisted state
 * (saved connections, pinned tabs, license activation, query history, schema cache)
 * does not bleed between specs.
 *
 * Customise behaviour via env on the launched main process by extending `env` below —
 * for example, set `DP_E2E=1` to opt the app into test-only behaviour if needed.
 */
export const test = base.extend<ElectronFixtures>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'data-peek-e2e-'))
    await use(dir)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup; temp dir will be reaped by the OS.
    }
  },

  electronApp: async ({ userDataDir }, use) => {
    if (!existsSync(MAIN_ENTRY)) {
      throw new Error(
        `Electron main bundle not found at ${MAIN_ENTRY}. Run \`pnpm build\` first ` +
          `(or use \`pnpm test:e2e\`, which builds before running).`
      )
    }

    const app = await _electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        // Mark the run so the app can branch on it if needed (e.g. skip auto-updater).
        DP_E2E: '1',
        NODE_ENV: 'production'
      }
    })

    await use(app)
    await app.close()
  },

  window: async ({ electronApp, consoleErrors: _consoleErrors }, use) => {
    // Force the consoleErrors fixture to set up first so the listener is attached
    // BEFORE we await firstWindow / domcontentloaded — otherwise any console.error
    // emitted during the initial mount would be missed.
    void _consoleErrors
    const win = await electronApp.firstWindow()
    // Wait for renderer DOM to settle — Vite's loading splash is otherwise interactive.
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },

  consoleErrors: async ({ electronApp }, use) => {
    const errors: string[] = []
    // window-creation event fires as soon as a BrowserWindow is created, before its
    // renderer has had a chance to print anything. Attach the console listener at
    // creation time so we observe boot-time errors.
    electronApp.on('window', (page: Page) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => {
        errors.push(err.message)
      })
    })
    // The first window may already exist by the time this fixture sets up (Playwright
    // resolves fixtures concurrently). Attach to it explicitly too.
    void electronApp.firstWindow().then((page) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => {
        errors.push(err.message)
      })
    })
    await use(() => [...errors])
  }
})

export { expect } from '@playwright/test'
