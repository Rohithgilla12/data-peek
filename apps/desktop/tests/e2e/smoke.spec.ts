import { test, expect } from './fixtures/electron-app'

/**
 * Smoke tests — exercise the bare minimum so the harness itself stays honest.
 *
 * These DO NOT touch a real database. Anything DB-dependent belongs in its own spec
 * with a Postgres fixture (testcontainers, docker-compose, or a hosted dev DB).
 */

test('the app launches and shows the main window', async ({ electronApp, window }) => {
  // Sanity check: an Electron BrowserWindow exists.
  const winCount = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(winCount).toBeGreaterThanOrEqual(1)

  // Renderer reports a non-empty title — this catches white-screen regressions
  // where the renderer fails to mount.
  const title = await window.title()
  expect(title.length).toBeGreaterThan(0)
})

test('the renderer mounts and reaches an interactive state', async ({ consoleErrors, window }) => {
  // The Tanstack Router root renders a #root div regardless of route. If the renderer
  // failed to boot, this would never appear.
  await expect(window.locator('#root')).toBeAttached({ timeout: 15_000 })

  // Give React/effects time to settle.
  await window.waitForTimeout(500)

  // The consoleErrors fixture starts capturing inside electronApp/firstWindow, BEFORE
  // domcontentloaded — registering the listener inside this test would miss any error
  // emitted during the initial mount, which is the exact regression class we want to
  // catch.
  const meaningful = consoleErrors().filter((e) => !e.includes('Autofill.enable'))
  expect(meaningful, `Unexpected console errors during mount:\n${meaningful.join('\n')}`).toEqual([])
})

test('userData isolation: each test gets a fresh app state', async ({ userDataDir, window }) => {
  // The temp directory exists and is unique per test (see fixture).
  expect(userDataDir).toMatch(/data-peek-e2e-/)

  // Probe the IPC contract directly — and assert the response shape, not just "is it
  // an array". The previous version called `Array.isArray(response)` on the IPC
  // envelope `{ success, data }`, which is always false, so the assertion would pass
  // for ANY broken state: missing `window.api`, renamed `connections` namespace,
  // persisted state from a prior test. Now we fail loudly when the contract drifts.
  const response = await window.evaluate(() => window.api.connections.list())

  expect(response.success).toBe(true)
  expect(Array.isArray(response.data)).toBe(true)
  expect(response.data).toEqual([])
})
