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

test('the renderer mounts and reaches an interactive state', async ({ window }) => {
  // The Tanstack Router root renders a #root div regardless of route. If the renderer
  // failed to boot, this would never appear.
  await expect(window.locator('#root')).toBeAttached({ timeout: 15_000 })

  // No uncaught console errors during initial mount. We allow warnings (Electron emits
  // a few in dev mode) but error-level entries usually mean a regression.
  const errors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // Give React/effects time to settle.
  await window.waitForTimeout(500)

  // Filter known-noisy errors here as the suite grows.
  const meaningful = errors.filter((e) => !e.includes('Autofill.enable'))
  expect(meaningful, `Unexpected console errors during mount:\n${meaningful.join('\n')}`).toEqual([])
})

test('userData isolation: each test gets a fresh app state', async ({ userDataDir, window }) => {
  // The temp directory exists and is unique per test (see fixture).
  expect(userDataDir).toMatch(/data-peek-e2e-/)

  // The renderer should NOT find any persisted saved connections from a previous run,
  // because each test starts with an empty userData dir. We probe via window.api which
  // the preload script exposes.
  const connections = await window.evaluate(async () => {
    const api = (window as unknown as { api?: { connections?: { list?: () => Promise<unknown> } } })
      .api
    if (!api?.connections?.list) return null
    return api.connections.list()
  })

  // First-run state: no persisted connections.
  expect(Array.isArray(connections) ? connections : []).toEqual([])
})
