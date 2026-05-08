# End-to-end tests

Playwright-driven tests against the real built Electron app. The fixtures in
`fixtures/electron-app.ts` boot `out/main/index.js` for each test with an isolated
`--user-data-dir`, so persisted state (connections, pinned tabs, query history,
licence activation, schema cache) does not bleed between specs.

## Run

```bash
# From apps/desktop:
pnpm test:e2e          # build + run headlessly
pnpm test:e2e:ui       # build + run in Playwright's UI mode (best for authoring)
pnpm test:e2e:debug    # build + run with PWDEBUG=1 (inspector + breakpoints)
```

The `pnpm build` step is wired into the npm scripts so the bundle in `out/` is
always fresh. If you want to skip the build (e.g. iterating on a test against an
already-built bundle), invoke Playwright directly:

```bash
pnpm exec playwright test
```

## Adding a test

1. Drop a new `*.spec.ts` in `tests/e2e/`.
2. Import `{ test, expect }` from `./fixtures/electron-app` (NOT from `@playwright/test` —
   the local `test` is the extended one with the `electronApp` / `window` / `userDataDir`
   fixtures).
3. Use `electronApp.evaluate` for main-process introspection, and the `window` Page for
   renderer interactions.

```ts
import { test, expect } from './fixtures/electron-app'

test('my new behaviour', async ({ window }) => {
  await window.locator('button:has-text("New Query")').click()
  await expect(window.locator('.monaco-editor')).toBeVisible()
})
```

## Database-touching tests (not yet wired)

Smoke tests deliberately don't touch a real DB. To add Postgres-dependent specs:

- Bring up a local Postgres (the `seeds/` directory at the repo root has SQL fixtures
  ready to load), or use [testcontainers-node](https://node.testcontainers.org/) so CI
  can spin one up per test run.
- Drive the connection dialog through the UI, OR call `window.api.connections.add({...})`
  via `window.evaluate` to seed a saved connection without going through the modal.

Each test starts with a clean `userData` so saved connections must be re-added per spec
(or in a `test.beforeAll` for a suite that shares one).

## CI

Not wired into CI yet. When ready:

- The smoke tests need a virtual display on Linux runners (`xvfb-run`).
- macOS runners work without extra setup but Notarization isn't needed for e2e — the
  bundle from `out/` is unsigned and that's fine for the harness.
- Add a workflow step that runs `pnpm --filter @data-peek/desktop test:e2e` after the
  existing typecheck/test gates.
