import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * Playwright config for end-to-end tests against the built Electron app.
 *
 * The harness boots the real packaged main process from `out/main/index.js` (produced
 * by `pnpm build`) and drives the renderer via `_electron.launch()`. Each test gets
 * an isolated `userData` directory so persisted state (connections, pinned tabs,
 * licence, query history) doesn't bleed between specs.
 *
 * Run locally: `pnpm build && pnpm test:e2e`
 * Run interactively: `pnpm test:e2e:ui`
 */
export default defineConfig({
  // Absolute path so the resolution doesn't depend on cwd; coupled with the explicit
  // testIgnore below it keeps Playwright off our vitest unit tests in src/**/__tests__.
  testDir: resolve(__dirname, 'tests', 'e2e'),
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/node_modules/**'],

  // Each spec file owns its Postgres container and launches its own Electron app
  // against an isolated `userData` dir, so whole files can run concurrently without
  // shared state. We keep `fullyParallel` off (no intra-file parallelism — tests in a
  // file share one container) but let Playwright run several files at once via workers.
  // On CI that turns a serial 12-file run into a parallel one; locally we stay at a
  // single worker for readable, deterministic output. Override with E2E_WORKERS.
  fullyParallel: false,
  workers: process.env.E2E_WORKERS
    ? Number(process.env.E2E_WORKERS)
    : process.env.CI
      ? 2
      : 1,

  // Generous default — Electron cold-start + electron-vite output traversal is slow.
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },

  // Fail the suite if any `test.only` ships in.
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  // Output dir for traces, screenshots, attachments.
  outputDir: 'test-results/e2e',

  use: {
    // Capture trace on first retry — keeps cost low for green runs.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  }
})
