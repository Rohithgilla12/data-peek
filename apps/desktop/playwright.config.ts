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

  // Electron tests share a single OS-level app instance per test, so parallelism
  // adds OS-window juggling without much speedup. Keep it simple at one worker.
  fullyParallel: false,
  workers: 1,

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
