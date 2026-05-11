import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * Query + schema-introspection tests against the seeded Postgres. These pin the
 * IPC contract end-to-end: real Electron main process → real adapter → real
 * Postgres → results back to the renderer. If any layer breaks, these go red.
 *
 * The seed (`seeds/acme_saas_seed.sql`) contains a fictional SaaS schema with
 * users, organizations, projects, etc. — the row counts asserted here will hold
 * as long as the seed isn't edited.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test.beforeEach(async ({ window }) => {
  // Each test gets a fresh app + userData (fixture default), so seed the connection
  // we'll use through window.api.
  await window.evaluate(async (cfg) => {
    await window.api.connections.add(cfg)
  }, pg.config)
})

test('db.schemas returns the seeded tables', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.schemas(cfg, true)
  }, pg.config)

  expect(result.success).toBe(true)

  const schemas = (result.data?.schemas ?? []) as Array<{
    name: string
    tables: Array<{ name: string }>
  }>
  const publicSchema = schemas.find((s) => s.name === 'public')
  expect(publicSchema).toBeDefined()

  const tableNames = (publicSchema?.tables ?? []).map((t) => t.name)
  // A handful of tables we know the seed creates — keeps the assertion stable
  // even if the seed grows.
  expect(tableNames).toEqual(expect.arrayContaining(['users', 'organizations', 'projects']))
})

test('db.query against `users` returns rows with the expected shape', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.query(cfg, 'SELECT id, email, name FROM users ORDER BY email LIMIT 5')
  }, pg.config)

  expect(result.success).toBe(true)
  const data = result.data as {
    rows: Array<Record<string, unknown>>
    fields: Array<{ name: string }>
    rowCount: number
  }
  expect(data.rowCount).toBeGreaterThan(0)
  expect(data.fields.map((f) => f.name)).toEqual(['id', 'email', 'name'])
  for (const row of data.rows) {
    expect(typeof row.email).toBe('string')
  }
})

test('db.query reports a clean error for malformed SQL', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.query(cfg, 'SELECT * FROM nonexistent_table_xyzzy')
  }, pg.config)

  expect(result.success).toBe(false)
  expect(typeof result.error).toBe('string')
  // Postgres-flavoured error mentions the missing relation.
  expect(result.error?.toLowerCase()).toContain('nonexistent_table_xyzzy')
})

test('db.schemas hits the cache on the second call (returns fromCache: true)', async ({
  window
}) => {
  // First call populates the cache.
  await window.evaluate(async (cfg) => {
    await window.api.db.schemas(cfg, true)
  }, pg.config)

  // Second call should be served from cache.
  const second = await window.evaluate(async (cfg) => {
    return window.api.db.schemas(cfg, false)
  }, pg.config)

  expect(second.success).toBe(true)
  expect(second.data?.fromCache).toBe(true)
})

test('db.explain returns a non-empty plan tree', async ({ window }) => {
  // db.explain takes (config, query, analyze) — passing analyze: false for a
  // lightweight cost-only plan that doesn't require executing the query.
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.explain(cfg, 'SELECT id FROM users ORDER BY email LIMIT 1', false)
  }, pg.config)

  expect(result.success).toBe(true)
  // Postgres returns FORMAT JSON as a parsed array under `plan`; durationMs is always present.
  const data = result.data as { plan?: unknown; durationMs: number }
  expect(data.durationMs).toBeGreaterThanOrEqual(0)
  expect(data.plan).toBeDefined()
  // The plan is a non-empty JSON array from Postgres EXPLAIN FORMAT JSON.
  expect(Array.isArray(data.plan)).toBe(true)
  expect((data.plan as unknown[]).length).toBeGreaterThan(0)
})

test('db.query round-trips timestamp / jsonb / numeric without lossy mapping', async ({
  window
}) => {
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.query(
      cfg,
      `SELECT
         '2024-01-02 03:04:05'::timestamp AS t,
         '{"a":1,"b":[true]}'::jsonb AS j,
         42.5::numeric AS n`
    )
  }, pg.config)

  expect(result.success).toBe(true)
  const row = (result.data as { rows: Array<Record<string, unknown>> }).rows[0]
  expect(row.t).toBeTruthy()
  expect(typeof row.j).toBe('object')
  expect((row.j as { a: number }).a).toBe(1)
  expect(Number(row.n)).toBe(42.5)
})
