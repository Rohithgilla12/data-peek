import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests for the marketing site.
 *
 * These exist because two real bugs in the feature showcase were invisible to the
 * jsdom suite and shipped anyway:
 *
 *   1. Selecting a different clip kept playing the previous one. React reused the
 *      same <video> and only rewrote the <source> src attributes, which does
 *      nothing once the browser has selected a media resource. jsdom loads no
 *      media, so it cannot observe resource selection at all.
 *   2. Under prefers-reduced-motion the `controls` fallback never reached the DOM,
 *      because React does not reconcile hydration attribute mismatches. RTL
 *      `render()` is a pure client render and never hydrates.
 *
 * Both are only observable in a real browser against the real server output, so
 * this runs against a production build rather than `next dev` — the hydration path
 * is the point.
 *
 * Deliberately kept to that: a handful of assertions about media actually loading
 * and reduced-motion actually degrading. Behaviour that jsdom *can* see belongs in
 * the Vitest suite, which is far faster.
 */
// Deliberately obscure. 3000/3100 collide with other dev servers, and combined with
// `reuseExistingServer` a collision means silently testing an unrelated app — which
// happened on the first run of this suite (port 3100 was an iOS Simulator preview).
const PORT = 3421;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Sequential: every spec drives the same page and the suite is tiny.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Always builds. Slower on a cold local run, but it removes the footgun of
    // testing a stale build, and a production build is what these tests are for.
    // PORT rather than `-p`: pnpm forwards `--` through to next, which reads it as a
    // project directory and dies. Next honours PORT directly.
    command: `pnpm run build && PORT=${PORT} pnpm run start`,
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse. The suite rebuilds regardless, so reuse buys no speed — and it
    // trades that for the risk of binding to whatever else happens to hold the port
    // and reporting failures against the wrong application. Failing loudly on a
    // taken port is the better outcome.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
