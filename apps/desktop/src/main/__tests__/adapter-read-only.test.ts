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

const mysqlLog: string[] = []
let mysqlFailOn: string | null = null
const mysqlConnection = {
  query: vi.fn(async (q: string | { sql: string }) => {
    const sql = typeof q === 'string' ? q : q.sql
    mysqlLog.push(sql)
    if (sql === mysqlFailOn) throw new Error('boom')
    return [[{ n: 1 }], [{ name: 'n', type: 3 }]]
  })
}
vi.mock('../adapters/mysql-pool-manager', () => ({
  withMySQLConnection: (_c: unknown, fn: (conn: typeof mysqlConnection) => unknown) =>
    fn(mysqlConnection)
}))

const mssqlLog: string[] = []
let mssqlFailOn: string | null = null
const mssqlTransaction = {
  request: () => ({
    query: async (sql: string) => {
      mssqlLog.push(sql)
      if (sql === mssqlFailOn) throw new Error('boom')
      return { recordset: [{ n: 1 }], rowsAffected: [1] }
    }
  })
}
vi.mock('../adapters/mssql-pool-manager', () => ({
  withMSSQLRolledBackTransaction: async (
    _c: unknown,
    fn: (t: typeof mssqlTransaction) => unknown
  ) => {
    mssqlLog.push('BEGIN')
    try {
      return await fn(mssqlTransaction)
    } finally {
      mssqlLog.push('ROLLBACK')
    }
  }
}))

import { MySQLAdapter } from '../adapters/mysql-adapter'
import { MSSQLAdapter } from '../adapters/mssql-adapter'

const config = { id: 'c', name: 'c', dbType: 'mysql' } as unknown as ConnectionConfig

beforeEach(() => {
  mysqlLog.length = 0
  mssqlLog.length = 0
  mysqlFailOn = null
  mssqlFailOn = null
})

describe('MySQLAdapter.queryReadOnly', () => {
  it('runs the statement inside a READ ONLY transaction and rolls it back', async () => {
    const result = await new MySQLAdapter().queryReadOnly(config, 'SELECT f()', {
      timeoutMs: 1000
    })
    expect(mysqlLog).toEqual(['START TRANSACTION READ ONLY', 'SELECT f()', 'ROLLBACK'])
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('still rolls back when the statement fails', async () => {
    mysqlFailOn = 'SELECT f()'
    await expect(
      new MySQLAdapter().queryReadOnly(config, 'SELECT f()', { timeoutMs: 1000 })
    ).rejects.toThrow('boom')
    expect(mysqlLog.at(-1)).toBe('ROLLBACK')
  })
})

describe('MSSQLAdapter.queryReadOnly', () => {
  it('runs the statement inside a transaction that is rolled back', async () => {
    const result = await new MSSQLAdapter().queryReadOnly(config, 'SELECT dbo.f()')
    expect(mssqlLog).toEqual(['BEGIN', 'SELECT dbo.f()', 'ROLLBACK'])
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('still rolls back when the statement fails', async () => {
    mssqlFailOn = 'SELECT dbo.f()'
    await expect(new MSSQLAdapter().queryReadOnly(config, 'SELECT dbo.f()')).rejects.toThrow('boom')
    expect(mssqlLog.at(-1)).toBe('ROLLBACK')
  })
})
