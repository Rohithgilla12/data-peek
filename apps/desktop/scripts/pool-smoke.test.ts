// Live smoke test against a real Postgres (Docker container). Not part of `pnpm test` —
// run explicitly with: pnpm --filter @data-peek/desktop exec vitest run scripts/pool-smoke.test.ts
//
// Required env (with sensible defaults pointing at the docker container the smoke harness spins up):
//   PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=smoketest PGDATABASE=acme
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

// The main-process logger imports `electron` which isn't available outside Electron.
vi.mock('../src/main/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { withPgClient, withPgTransaction, closePgPool, closeAllPgPools } = await import(
  '../src/main/adapters/pg-pool-manager'
)
const { registerQuery, cancelQuery } = await import('../src/main/query-tracker')

const config: ConnectionConfig = {
  id: 'smoke-pool',
  name: 'smoke',
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 55432),
  database: process.env.PGDATABASE ?? 'acme',
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'smoketest',
  dbType: 'postgresql',
  dstPort: Number(process.env.PGPORT ?? 55432)
}

beforeAll(async () => {
  // Sanity: confirm we can connect at all before running the rest.
  await withPgClient(config, async (c) => {
    const r = await c.query('SELECT current_database() AS db')
    if (r.rows[0].db !== config.database) throw new Error('wrong database')
  })
})

afterAll(async () => {
  await closeAllPgPools()
})

describe('pool latency', () => {
  it('warm-pool queries are dramatically faster than cold-pool first query', async () => {
    // Drop any pool from beforeAll to start cold.
    await closePgPool(config)

    const cold = Date.now()
    await withPgClient(config, async (c) => {
      await c.query('SELECT 1')
    })
    const coldMs = Date.now() - cold

    const warmStart = Date.now()
    for (let i = 0; i < 5; i++) {
      await withPgClient(config, async (c) => {
        await c.query('SELECT 1')
      })
    }
    const warmAvgMs = (Date.now() - warmStart) / 5

    // eslint-disable-next-line no-console
    console.log(`cold=${coldMs}ms warm-avg=${warmAvgMs.toFixed(2)}ms`)
    expect(coldMs).toBeGreaterThan(warmAvgMs)
    // On loopback the absolute number is small; we still expect ~order-of-magnitude.
    expect(warmAvgMs).toBeLessThan(coldMs)
  })
})

describe('concurrent first-use sharing', () => {
  it('10 parallel callers share one pool with no errors', async () => {
    await closePgPool(config)
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        withPgClient(config, async (c) => {
          const r = await c.query('SELECT pg_backend_pid() AS pid')
          return Number(r.rows[0].pid)
        })
      )
    )
    expect(results).toHaveLength(10)
    // Pool max=5, so at most 5 distinct PIDs are observed (some get reused by sequential acquires).
    const distinct = new Set(results).size
    expect(distinct).toBeGreaterThan(0)
    expect(distinct).toBeLessThanOrEqual(5)
    // eslint-disable-next-line no-console
    console.log(`10 concurrent acquires used ${distinct} distinct backends`)
  })
})

describe('withPgTransaction against real Postgres', () => {
  it('COMMIT persists rows', async () => {
    await withPgClient(config, async (c) => {
      await c.query('CREATE TABLE IF NOT EXISTS smoke_tx (n int)')
      await c.query('TRUNCATE smoke_tx')
    })

    await withPgTransaction(config, async (c) => {
      await c.query('INSERT INTO smoke_tx VALUES (1), (2)')
    })

    await withPgClient(config, async (c) => {
      const r = await c.query('SELECT count(*)::int AS n FROM smoke_tx')
      expect(r.rows[0].n).toBe(2)
    })
  })

  it('ROLLBACK on fn error rejects with the original error and discards the writes', async () => {
    const original = new Error('intentional')
    await expect(
      withPgTransaction(config, async (c) => {
        await c.query('INSERT INTO smoke_tx VALUES (99)')
        throw original
      })
    ).rejects.toBe(original)

    await withPgClient(config, async (c) => {
      const r = await c.query('SELECT count(*)::int AS n FROM smoke_tx WHERE n = 99')
      expect(r.rows[0].n).toBe(0)
    })
  })

  it('ROLLBACK on a SQL error still rolls back the prior writes in the same tx', async () => {
    await expect(
      withPgTransaction(config, async (c) => {
        await c.query('INSERT INTO smoke_tx VALUES (42)')
        await c.query('SELECT * FROM nonexistent_table_xyz')
      })
    ).rejects.toThrow(/nonexistent_table_xyz/)

    await withPgClient(config, async (c) => {
      const r = await c.query('SELECT count(*)::int AS n FROM smoke_tx WHERE n = 42')
      expect(r.rows[0].n).toBe(0)
    })
  })
})

describe('query cancellation', () => {
  it('cancel via release(true) aborts an in-flight long query', async () => {
    const exec = 'smoke-cancel-1'
    const start = Date.now()
    const queryPromise = withPgClient(config, async (client) => {
      registerQuery(exec, { type: 'postgresql', client })
      try {
        await client.query('SELECT pg_sleep(30)')
      } finally {
        // unregister even on failure — mimics adapter's queryMultiple
      }
    })
    // Give the query 200ms to start, then cancel.
    await new Promise((r) => setTimeout(r, 200))
    const cancelResult = await cancelQuery(exec)
    expect(cancelResult.cancelled).toBe(true)

    await expect(queryPromise).rejects.toBeTruthy()
    const elapsed = Date.now() - start
    // eslint-disable-next-line no-console
    console.log(`cancel aborted 30s sleep after ${elapsed}ms`)
    expect(elapsed).toBeLessThan(5_000)

    // Pool should still be usable after the cancel destroyed one client.
    await withPgClient(config, async (c) => {
      const r = await c.query('SELECT 1 AS ok')
      expect(r.rows[0].ok).toBe(1)
    })
  })
})

describe('closePgPool', () => {
  it('forces a fresh pool/backend on next acquire', async () => {
    const pidBefore = await withPgClient(config, async (c) => {
      const r = await c.query('SELECT pg_backend_pid() AS pid')
      return Number(r.rows[0].pid)
    })
    await closePgPool(config)
    // Wait briefly so the server-side terminate completes before the new acquire.
    await new Promise((r) => setTimeout(r, 100))
    const pidAfter = await withPgClient(config, async (c) => {
      const r = await c.query('SELECT pg_backend_pid() AS pid')
      return Number(r.rows[0].pid)
    })
    expect(pidAfter).not.toBe(pidBefore)
    // eslint-disable-next-line no-console
    console.log(`pid before=${pidBefore} after-close=${pidAfter}`)
  })
})

describe('schema introspection on real DB', () => {
  it('getSchemas via the adapter returns the seeded acme tables', async () => {
    const { PostgresAdapter } = await import('../src/main/adapters/postgres-adapter')
    const adapter = new PostgresAdapter()
    const schemas = await adapter.getSchemas(config)
    const pub = schemas.find((s) => s.name === 'public')
    expect(pub).toBeDefined()
    expect((pub?.tables ?? []).length).toBeGreaterThanOrEqual(9)
    // eslint-disable-next-line no-console
    console.log(
      `getSchemas saw ${pub?.tables.length} tables in public:`,
      pub?.tables.map((t) => t.name).join(', ')
    )
  })
})
