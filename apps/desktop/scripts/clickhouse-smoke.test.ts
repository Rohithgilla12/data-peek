import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import {
  CAPABILITY_LABELS,
  DB_CAPABILITIES,
  isTextExplainPlan,
  type Capability,
  type ConnectionConfig
} from '@shared/index'

vi.mock('../src/main/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { ClickHouseAdapter, closeAllClickHousePools } =
  await import('../src/main/adapters/clickhouse-adapter')
const { withClickHouseClient } = await import('../src/main/adapters/clickhouse-pool-manager')
const { cancelQuery } = await import('../src/main/query-tracker')
const { requireCapability } = await import('../src/main/lib/capability-guard')
const { runReadOnlyQuery } = await import('../src/main/mcp/read-guard')
const { getAdapter } = await import('../src/main/db-adapter')
const { buildQualifiedTableRef, buildSelectQuery } =
  await import('../src/renderer/src/lib/sql-helpers')

const port = Number(process.env.CH_PORT ?? 58123)
const config: ConnectionConfig = {
  id: 'smoke-ch',
  name: 'smoke',
  host: process.env.CH_HOST ?? 'localhost',
  port,
  database: process.env.CH_DATABASE ?? 'acme_analytics',
  user: process.env.CH_USER ?? 'datapeek',
  password: process.env.CH_PASSWORD ?? 'smoketest',
  dbType: 'clickhouse',
  dstPort: port
}
const db = config.database
const adapter = new ClickHouseAdapter()

async function selectRows<T>(sql: string): Promise<T[]> {
  return withClickHouseClient(config, async (client) => {
    const rs = await client.query({ query: sql, format: 'JSON' })
    return (await rs.json<T>()).data
  })
}

const GATED_TAG = `smoke-gated-${Date.now()}`

beforeAll(async () => {
  await adapter.connect(config)
})

afterAll(async () => {
  await closeAllClickHousePools()
})

describe('connect', () => {
  it('registers the adapter for the clickhouse dbType', () => {
    expect(getAdapter(config)).toBeInstanceOf(ClickHouseAdapter)
  })

  it('fails with a clear message on a wrong password', async () => {
    await expect(
      adapter.connect({ ...config, id: 'smoke-ch-bad', password: 'nope' })
    ).rejects.toThrow(/Authentication failed|AUTHENTICATION_FAILED|password/i)
  })

  it('refuses the native port with a hint before dialing', async () => {
    await expect(adapter.connect({ ...config, id: 'smoke-ch-9000', port: 9000 })).rejects.toThrow(
      /native port.*HTTP interface/
    )
  })
})

describe('schema', () => {
  it('lists the seeded tables with their types, nullability, enums and primary keys', async () => {
    const schemas = await adapter.getSchemas(config)
    expect(schemas[0].name).toBe(db)
    expect(schemas.map((s) => s.name)).not.toContain('system')
    expect(schemas.map((s) => s.name)).not.toContain('INFORMATION_SCHEMA')

    const acme = schemas[0]
    expect(acme.tables.map((t) => [t.name, t.type])).toEqual([
      ['active_orgs', 'view'],
      ['daily_events', 'table'],
      ['daily_events_mv', 'materialized_view'],
      ['events', 'table'],
      ['odd-names', 'table'],
      ['organizations', 'table'],
      ['users', 'table']
    ])
    expect(acme.tables.some((t) => t.name.startsWith('.inner'))).toBe(false)

    const events = acme.tables.find((t) => t.name === 'events')!
    expect(events.estimatedRowCount).toBe(50000)
    const col = (name: string) => events.columns.find((c) => c.name === name)!
    expect(col('event_time').dataType).toBe("DateTime64(3, 'UTC')")
    expect(col('event_time').isPrimaryKey).toBe(true)
    expect(col('org_id').isPrimaryKey).toBe(true)
    expect(col('event_id').isPrimaryKey).toBe(false)
    expect(col('revenue').isNullable).toBe(true)
    expect(col('revenue').dataType).toBe('Nullable(Decimal(18, 4))')
    expect(col('status').enumValues).toEqual(['ok', 'error'])
    expect(col('big_counter').dataType).toBe('UInt64')

    const users = acme.tables.find((t) => t.name === 'users')!
    expect(users.columns.find((c) => c.name === 'display_name')!.isNullable).toBe(true)
    const orgs = acme.tables.find((t) => t.name === 'organizations')!
    expect(orgs.columns.find((c) => c.name === 'plan')!.enumValues).toEqual([
      'free',
      'starter',
      'pro',
      'enterprise'
    ])
    const odd = acme.tables.find((t) => t.name === 'odd-names')!
    expect(odd.columns.map((c) => c.name)).toEqual(['order', 'select', 'has space'])
  })
})

describe('queryMultiple', () => {
  it('carries SET across statements in one script and flags data-returning statements', async () => {
    const r = await adapter.queryMultiple(
      config,
      `SET max_threads = 3;
       SELECT getSetting('max_threads') AS t;
       INSERT INTO ${db}.daily_events VALUES ('2030-01-01', 'smoke', 1);
       SELECT count() AS n FROM ${db}.daily_events WHERE event_type = 'smoke'`,
      { executionId: 'smoke-multi' }
    )
    expect(r.results.map((s) => s.isDataReturning)).toEqual([false, true, false, true])
    expect(Number(r.results[1].rows[0].t)).toBe(3)
    expect(r.results[1].fields[0].name).toBe('t')
    expect(r.results[2].rowCount).toBe(1)
    expect(Number(r.results[3].rows[0].n)).toBeGreaterThanOrEqual(1)
  })

  it('round-trips the UInt64 maximum as an exact string', async () => {
    const r = await adapter.query(config, `SELECT max(big_counter) AS m FROM ${db}.events`)
    expect(r.rows[0].m).toBe('18446744073709551615')
    expect(r.fields[0].dataType).toBe('UInt64')
  })

  it('returns nulls, arrays, maps and decimals in a shape the grid can show', async () => {
    const r = await adapter.query(
      config,
      `SELECT display_name FROM ${db}.users WHERE display_name IS NULL LIMIT 1;
       SELECT tags, properties, revenue FROM ${db}.events WHERE revenue IS NOT NULL ORDER BY event_time LIMIT 1`
    )
    expect(Array.isArray(r.rows[0].tags)).toBe(true)
    expect(typeof r.rows[0].properties).toBe('object')
    expect(typeof r.rows[0].revenue).toBe('string')
  })

  it('splits on ; outside strings and backtick identifiers on odd-names', async () => {
    const r = await adapter.queryMultiple(
      config,
      `SELECT \`order\`, \`select\`, \`has space\` FROM ${db}.\`odd-names\` WHERE \`select\` = 'a;b';
       SELECT count() AS n FROM ${db}.\`odd-names\` WHERE \`select\` = 'it\\'s'`
    )
    expect(r.results).toHaveLength(2)
    expect(r.results[0].rows).toEqual([{ order: 1, select: 'a;b', 'has space': null }])
    expect(r.results[1].rows[0]).toEqual({ n: '1' })
  })

  it('refuses a user-written FORMAT clause with a clear message', async () => {
    await expect(adapter.query(config, 'SELECT 1 FORMAT JSONEachRow')).rejects.toThrow(
      'Remove the FORMAT clause; data-peek formats results itself.'
    )
  })

  it('reports the failing statement number', async () => {
    await expect(adapter.query(config, 'SELECT 1; SELECT * FROM no_such_table')).rejects.toThrow(
      /Error in statement 2:.*no_such_table/s
    )
  })
})

describe('timeout', () => {
  it('rejects with TIMEOUT_EXCEEDED when the server deadline passes', async () => {
    // sleepEachRow is capped at 3 s per block, so one row per block keeps each sleep legal
    // while the statement as a whole takes 10 s.
    await expect(
      adapter.queryMultiple(
        config,
        'SELECT sleepEachRow(1) FROM numbers(10) SETTINGS max_block_size = 1',
        { queryTimeoutMs: 1500 }
      )
    ).rejects.toThrow(/TIMEOUT_EXCEEDED/)
  }, 15_000)
})

describe('cancel', () => {
  it('rejects promptly and the query leaves system.processes', async () => {
    const executionId = `smoke-cancel-${Date.now()}`
    const running = adapter.queryMultiple(
      config,
      'SELECT sleepEachRow(1) FROM numbers(20) SETTINGS max_block_size = 1',
      { executionId }
    )
    // Attach the handler now: the rejection lands while cancelQuery's KILL is in flight.
    const outcome = running.then(
      () => 'resolved',
      (e: Error) => e.message
    )
    await new Promise((r) => setTimeout(r, 300))
    const t0 = Date.now()
    const cancelled = await cancelQuery(executionId)
    expect(await outcome).toMatch(/cancelled/i)
    expect(Date.now() - t0).toBeLessThan(500)
    expect(cancelled.cancelled).toBe(true)

    await new Promise((r) => setTimeout(r, 2000))
    const live = await selectRows<{ query_id: string }>(
      `SELECT query_id FROM system.processes WHERE query_id LIKE '${executionId}:%'`
    )
    expect(live).toEqual([])
  }, 15_000)
})

describe('explain', () => {
  it('returns a text plan whose first line is the top expression', async () => {
    const r = await adapter.explain(
      config,
      `SELECT count() FROM ${db}.events WHERE org_id = 3`,
      false
    )
    expect(isTextExplainPlan(r.plan)).toBe(true)
    if (!isTextExplainPlan(r.plan)) return
    expect(r.plan.lines[0]).toMatch(/^Expression/)
    expect(r.plan.lines.length).toBeGreaterThan(3)
  })
})

describe('pagination', () => {
  it('runs the renderer preview SQL for page 3 of events', async () => {
    const ref = buildQualifiedTableRef(db, 'events', 'clickhouse')
    const sql = buildSelectQuery(ref, 'clickhouse', {
      orderBy: 'ORDER BY event_time',
      limit: 50,
      offset: 100
    })
    const r = await adapter.query(config, sql)
    expect(r.rows).toHaveLength(50)
  })

  it('previews odd-names through the same quoting path', async () => {
    const ref = buildQualifiedTableRef(db, 'odd-names', 'clickhouse')
    const r = await adapter.query(config, buildSelectQuery(ref, 'clickhouse', { limit: 10 }))
    expect(r.rowCount).toBe(3)
  })
})

describe('health', () => {
  it('reports active part sizes per table', async () => {
    const r = await adapter.getTableSizes(config, db)
    const events = r.tables.find((t) => t.table === 'events')!
    expect(events.schema).toBe(db)
    expect(events.rowCountEstimate).toBe(50000)
    expect(events.dataSizeBytes).toBeGreaterThan(100_000)
    expect(r.dbSize.totalSizeBytes).toBeGreaterThan(events.dataSizeBytes)
  })

  it('totals bytes_on_disk without counting index files twice', async () => {
    const r = await adapter.getTableSizes(config)
    const [expected] = await selectRows<{ total: string }>(
      `SELECT sum(bytes_on_disk) AS total FROM system.parts
       WHERE active AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')`
    )
    expect(r.dbSize.totalSizeBytes).toBe(Number(expected.total))
    for (const t of r.tables) {
      expect(t.dataSizeBytes + t.indexSizeBytes).toBe(t.totalSizeBytes)
    }
  })
})

describe('gating', () => {
  const gatedOff = (Object.keys(CAPABILITY_LABELS) as Capability[]).filter(
    (cap) => !DB_CAPABILITIES.clickhouse[cap]
  )

  it.each(gatedOff)('requireCapability refuses %s with the labelled message', (cap) => {
    expect(() => requireCapability(config, cap)).toThrow(
      `${CAPABILITY_LABELS[cap]} is not available for ClickHouse connections.`
    )
  })

  it('adapter backstops throw the same message', async () => {
    const same = (cap: Capability) =>
      `${CAPABILITY_LABELS[cap]} is not available for ClickHouse connections.`
    await expect(
      adapter.executeTransaction(config, [
        {
          sql: `INSERT INTO ${db}.daily_events VALUES ('2030-01-02', '${GATED_TAG}', 1)`,
          params: []
        }
      ])
    ).rejects.toThrow(same('transactions'))
    await expect(
      adapter.execute(config, `INSERT INTO ${db}.daily_events VALUES ('2030-01-02', ?, 1)`, [
        GATED_TAG
      ])
    ).rejects.toThrow(same('inlineEdit'))
    await expect(adapter.getActiveQueries(config)).rejects.toThrow(same('healthActiveQueries'))
    await expect(adapter.getCacheStats(config)).rejects.toThrow(same('healthCacheStats'))
    await expect(adapter.getLocks(config)).rejects.toThrow(same('healthLocks'))
    await expect(adapter.killQuery(config, 1)).rejects.toThrow(same('killQuery'))
    await expect(adapter.getColumnStats(config, db, 'events', 'org_id', 'UInt32')).rejects.toThrow(
      same('columnStats')
    )
  })

  it('reports every Schema Intel check as skipped', async () => {
    const report = await adapter.runSchemaIntel(config)
    expect(report.findings).toEqual([])
    expect(report.skipped.length).toBeGreaterThan(0)
  })
})

describe('mcp read guard', () => {
  it('rejects an INSERT with the server READONLY error, not only the keyword guard', async () => {
    await expect(
      adapter.queryReadOnly(
        config,
        `INSERT INTO ${db}.daily_events VALUES ('2030-01-03', '${GATED_TAG}', 1)`,
        { timeoutMs: 5000 }
      )
    ).rejects.toThrow(/READONLY/)
  })

  it('rejects the url() table function with READONLY through runReadOnlyQuery', async () => {
    await expect(
      runReadOnlyQuery(
        config,
        `SELECT * FROM url('http://127.0.0.1:1/${GATED_TAG}', 'CSV', 'a String')`
      )
    ).rejects.toThrow(/READONLY/)
  })

  it('returns capped rows for a plain SELECT', async () => {
    const r = await runReadOnlyQuery(config, `SELECT number FROM numbers(1000)`, 5)
    expect(r.rows).toHaveLength(5)
  })

  it('stops a huge SELECT on the server instead of fetching every row', async () => {
    const sql = `SELECT number FROM numbers(10000000)`
    const started = Date.now()
    const raw = await adapter.queryReadOnly(config, sql, { timeoutMs: 30_000, maxRows: 500 })
    expect(raw.rows.length).toBeLessThan(1_000_000)
    const capped = await runReadOnlyQuery(config, sql)
    expect(capped.rows.length).toBeLessThanOrEqual(500)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})

describe('nothing gated reached the server', () => {
  it('leaves no tagged row in system.query_log', async () => {
    await withClickHouseClient(config, (client) => client.command({ query: 'SYSTEM FLUSH LOGS' }))
    const rows = await selectRows<{ n: string }>(
      `SELECT count() AS n FROM system.query_log
       WHERE query LIKE '%${GATED_TAG}%' AND query NOT LIKE '%system.query_log%'
         AND type = 'QueryFinish'`
    )
    expect(rows[0].n).toBe('0')
    const inserted = await selectRows<{ n: string }>(
      `SELECT count() AS n FROM ${db}.daily_events WHERE event_type = '${GATED_TAG}'`
    )
    expect(inserted[0].n).toBe('0')
  })
})
