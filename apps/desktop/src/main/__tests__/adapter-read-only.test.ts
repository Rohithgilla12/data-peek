import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))

/**
 * A fake connection that records statements. The statement named `hang` never
 * settles on its own; it rejects once the connection is killed, the way a real
 * driver fails an in-flight query when cancel tears the connection down.
 */
function fakeConnection(kill: 'destroy' | 'release' | 'cancel') {
  const log: string[] = []
  let failOn: string | null = null
  let hang: string | null = null
  let rejectHang: ((e: Error) => void) | null = null
  let killed = false
  const run = async (q: string | { sql: string }): Promise<unknown> => {
    const sql = typeof q === 'string' ? q : q.sql
    log.push(sql)
    if (killed) throw new Error('connection is closed')
    if (sql === failOn) throw new Error('boom')
    if (sql === hang) {
      return new Promise((_resolve, reject) => {
        rejectHang = reject
      })
    }
    return undefined
  }
  const killNow = (): void => {
    if (killed && kill === 'release') throw new Error('Release called twice')
    killed = true
    rejectHang?.(new Error('killed'))
  }
  return {
    log,
    failOn: (sql: string) => (failOn = sql),
    hangOn: (sql: string) => (hang = sql),
    run,
    killNow,
    reset: () => {
      log.length = 0
      failOn = hang = null
      rejectHang = null
      killed = false
    }
  }
}

const mysql = fakeConnection('destroy')
const mysqlConnection = {
  query: vi.fn(async (q: string | { sql: string }) => {
    await mysql.run(q)
    return [[{ n: 1 }], [{ name: 'n', type: 3 }]]
  }),
  destroy: vi.fn(() => mysql.killNow())
}
vi.mock('../adapters/mysql-pool-manager', () => ({
  withMySQLConnection: (_c: unknown, fn: (conn: typeof mysqlConnection) => unknown) =>
    fn(mysqlConnection)
}))

const mssql = fakeConnection('cancel')
vi.mock('../adapters/mssql-pool-manager', () => ({
  withMSSQLRolledBackTransaction: async (_c: unknown, fn: (t: unknown) => unknown) => {
    mssql.log.push('BEGIN')
    try {
      return await fn({
        request: () => ({
          query: async (sql: string) => {
            await mssql.run(sql)
            return { recordset: [{ n: 1 }], rowsAffected: [1] }
          },
          cancel: () => mssql.killNow()
        })
      })
    } finally {
      mssql.log.push('ROLLBACK')
    }
  }
}))

const pg = fakeConnection('release')
const pgClient = {
  query: vi.fn(async (sql: string) => {
    await pg.run(sql)
    return { rows: [{ n: 1 }], fields: [{ name: 'n', dataTypeID: 23 }], rowCount: 1 }
  }),
  release: vi.fn((destroy?: boolean) => {
    if (destroy) pg.killNow()
  })
}
vi.mock('../adapters/pg-pool-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adapters/pg-pool-manager')>()),
  withPgClient: (_c: unknown, fn: (client: typeof pgClient) => unknown) => fn(pgClient)
}))

import { MySQLAdapter } from '../adapters/mysql-adapter'
import { MSSQLAdapter } from '../adapters/mssql-adapter'
import { PostgresAdapter } from '../adapters/postgres-adapter'
import { cancelQuery, isQueryActive } from '../query-tracker'

const config = { id: 'c', name: 'c', dbType: 'mysql' } as unknown as ConnectionConfig
const opts = { timeoutMs: 1000 }

async function untilActive(executionId: string): Promise<void> {
  await vi.waitFor(() => expect(isQueryActive(executionId)).toBe(true))
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const fake of [mysql, mssql, pg]) fake.reset()
})

describe('MySQLAdapter.queryReadOnly', () => {
  it('runs the statement inside a READ ONLY transaction and rolls it back', async () => {
    const result = await new MySQLAdapter().queryReadOnly(config, 'SELECT f()', opts)
    expect(mysql.log).toEqual(['START TRANSACTION READ ONLY', 'SELECT f()', 'ROLLBACK'])
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('still rolls back when the statement fails', async () => {
    mysql.failOn('SELECT f()')
    await expect(new MySQLAdapter().queryReadOnly(config, 'SELECT f()', opts)).rejects.toThrow(
      'boom'
    )
    expect(mysql.log.at(-1)).toBe('ROLLBACK')
  })
})

describe('MSSQLAdapter.queryReadOnly', () => {
  it('runs the statement inside a transaction that is rolled back', async () => {
    const result = await new MSSQLAdapter().queryReadOnly(config, 'SELECT dbo.f()', opts)
    expect(mssql.log).toEqual(['BEGIN', 'SELECT dbo.f()', 'ROLLBACK'])
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('still rolls back when the statement fails', async () => {
    mssql.failOn('SELECT dbo.f()')
    await expect(new MSSQLAdapter().queryReadOnly(config, 'SELECT dbo.f()', opts)).rejects.toThrow(
      'boom'
    )
    expect(mssql.log.at(-1)).toBe('ROLLBACK')
  })

  it('cancels the request once the timeout passes', async () => {
    mssql.hangOn('SELECT dbo.slow()')
    await expect(
      new MSSQLAdapter().queryReadOnly(config, 'SELECT dbo.slow()', { timeoutMs: 20 })
    ).rejects.toThrow(/timed out/)
    expect(mssql.log.at(-1)).toBe('ROLLBACK')
  })
})

describe('PostgresAdapter.queryReadOnly', () => {
  it('runs in a READ ONLY transaction with a statement timeout, then rolls back', async () => {
    const result = await new PostgresAdapter().queryReadOnly(config, 'SELECT 1', {
      timeoutMs: 30_000
    })
    expect(pg.log).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 30000',
      'SELECT 1',
      'ROLLBACK'
    ])
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('still rolls back when the statement fails', async () => {
    pg.failOn('SELECT oops')
    await expect(new PostgresAdapter().queryReadOnly(config, 'SELECT oops', opts)).rejects.toThrow(
      'boom'
    )
    expect(pg.log.at(-1)).toBe('ROLLBACK')
  })
})

describe.each([
  ['MySQL', () => new MySQLAdapter(), mysql, () => mysqlConnection.destroy],
  ['SQL Server', () => new MSSQLAdapter(), mssql, () => null],
  ['PostgreSQL', () => new PostgresAdapter(), pg, () => pgClient.release]
] as const)('%s read-only queries can be cancelled', (_name, make, fake, killFn) => {
  it('registers the running query, aborts it on cancel, and unregisters it', async () => {
    fake.hangOn('SELECT pg_sleep(600)')
    const running = make().queryReadOnly(config, 'SELECT pg_sleep(600)', {
      ...opts,
      executionId: `exec-${_name}`
    })
    const settled = expect(running).rejects.toThrow()
    await untilActive(`exec-${_name}`)

    await expect(cancelQuery(`exec-${_name}`)).resolves.toEqual({ cancelled: true })
    await settled

    expect(isQueryActive(`exec-${_name}`)).toBe(false)
    const kill = killFn()
    if (kill) expect(kill).toHaveBeenCalled()
  })
})
