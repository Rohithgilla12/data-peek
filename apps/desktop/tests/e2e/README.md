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

## Database-touching tests

`fixtures/postgres.ts` spins up a Postgres container via
[testcontainers-node](https://node.testcontainers.org/) and loads
`seeds/acme_saas_seed.sql` via the postgres image's `/docker-entrypoint-initdb.d/`
hook. Use it in a spec via `test.beforeAll` so the container is shared across the
file's tests:

```ts
import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test.beforeEach(async ({ window }) => {
  // Each test gets a fresh userData (fixture default), so re-seed the connection.
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
})

test('selects against the seed', async ({ window }) => {
  const result = await window.evaluate(
    (cfg) => window.api.db.query(cfg, 'SELECT count(*) FROM users'),
    pg.config
  )
  expect(result.success).toBe(true)
})
```

The container image is pinned to `postgres:16-alpine` so behaviour doesn't drift
on a Postgres minor bump. Container lifetime is bounded by the testcontainers Ryuk
reaper, so even if a test crashes mid-run the container is reaped within seconds.

Requirements:
- Docker available locally (Docker Desktop or OrbStack on macOS, Docker Engine on Linux).
- Existing tests assume the seed file at `seeds/acme_saas_seed.sql` is unchanged. If
  the seed grows or shrinks, update the assertions in `queries.spec.ts`.

## CI

`.github/workflows/e2e.yml` runs the suite on every PR and on `main`. The runner
is `ubuntu-latest` (Docker preinstalled) with `xvfb-run` for the virtual display.
On failure, the Playwright HTML report and `test-results/` artefacts are uploaded
for 7 days.

`TESTCONTAINERS_RYUK_DISABLED=true` is set in CI because the runner is torn down
per job anyway; this avoids the Ryuk image pull and a small startup cost.

To add macOS to the matrix later, no extra setup is needed (Docker is available
via runner-installed orbstack/docker desktop, and macOS Electron doesn't need
xvfb) — but macOS runner minutes are 10x Linux's, so the current single-OS
setup is intentional.
