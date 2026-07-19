import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

const mockAdapter = {
  dbType: 'postgresql',
  query: vi.fn(),
  beginTransaction: vi.fn(),
  queryInTransaction: vi.fn(),
  rollbackTransaction: vi.fn()
}

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('../db-adapter', () => ({
  getAdapter: vi.fn(() => mockAdapter)
}))

import { assertSingleReadStatement, runReadOnlyQuery, MCP_MAX_ROWS } from '../mcp/read-guard'

const pgConfig = {
  id: 'c1',
  name: 'local',
  dbType: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'test'
} as unknown as ConnectionConfig

describe('assertSingleReadStatement', () => {
  it('accepts a single SELECT', () => {
    expect(assertSingleReadStatement('SELECT 1', 'postgresql')).toBe('SELECT 1')
  })

  it('rejects multiple statements', () => {
    expect(() => assertSingleReadStatement('SELECT 1; DROP TABLE users', 'postgresql')).toThrow(
      /single statement/i
    )
  })

  it('rejects statements starting with a write keyword', () => {
    expect(() => assertSingleReadStatement('DELETE FROM users', 'postgresql')).toThrow(/read-only/i)
  })

  it('rejects WITH ... INSERT (data-modifying CTE)', () => {
    expect(() =>
      assertSingleReadStatement('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x', 'postgresql')
    ).toThrow(/read-only/i)
  })

  it('accepts EXPLAIN and SHOW', () => {
    expect(assertSingleReadStatement('EXPLAIN SELECT 1', 'postgresql')).toBe('EXPLAIN SELECT 1')
    expect(assertSingleReadStatement('SHOW server_version', 'postgresql')).toBe(
      'SHOW server_version'
    )
  })

  it('rejects SELECT ... INTO', () => {
    expect(() => assertSingleReadStatement('SELECT * INTO t2 FROM t1', 'mssql')).toThrow(
      /read-only/i
    )
  })

  it('rejects PRAGMA', () => {
    expect(() => assertSingleReadStatement('PRAGMA user_version = 5', 'postgresql')).toThrow(
      /read-only/i
    )
  })

  it('accepts a SELECT wrapped in parentheses', () => {
    expect(assertSingleReadStatement('(SELECT 1)', 'postgresql')).toBe('(SELECT 1)')
  })

  it('accepts SELECT with a write keyword inside a single-quoted string', () => {
    expect(assertSingleReadStatement("SELECT 'insert'", 'postgresql')).toBe("SELECT 'insert'")
  })

  it('accepts SELECT with a write keyword inside a double-quoted identifier', () => {
    expect(assertSingleReadStatement('SELECT "update" FROM t', 'postgresql')).toBe(
      'SELECT "update" FROM t'
    )
  })

  it('still rejects SELECT ... INTO after literal stripping', () => {
    expect(() => assertSingleReadStatement('SELECT * INTO t2 FROM t1', 'mssql')).toThrow(
      /read-only/i
    )
  })
})

describe('runReadOnlyQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdapter.beginTransaction.mockResolvedValue(undefined)
    mockAdapter.queryInTransaction.mockResolvedValue({ rows: [], fields: [], rowCount: 0 })
    mockAdapter.rollbackTransaction.mockResolvedValue(undefined)
  })

  it('runs postgres queries read-only, bounds them with a statement timeout, and rolls back', async () => {
    mockAdapter.queryInTransaction
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET TRANSACTION READ ONLY
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET LOCAL statement_timeout
      .mockResolvedValueOnce({ rows: [{ n: 1 }], fields: [], rowCount: 1 }) // the query

    const result = await runReadOnlyQuery(pgConfig, 'SELECT 1')

    expect(mockAdapter.beginTransaction).toHaveBeenCalledOnce()
    expect(mockAdapter.queryInTransaction).toHaveBeenNthCalledWith(
      1,
      pgConfig,
      expect.any(String),
      'SET TRANSACTION READ ONLY'
    )
    expect(mockAdapter.queryInTransaction).toHaveBeenNthCalledWith(
      2,
      pgConfig,
      expect.any(String),
      expect.stringContaining('statement_timeout')
    )
    expect(mockAdapter.rollbackTransaction).toHaveBeenCalledOnce()
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('rolls back even when the query throws', async () => {
    mockAdapter.queryInTransaction
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET TRANSACTION READ ONLY
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET LOCAL statement_timeout
      .mockRejectedValueOnce(new Error('syntax error'))

    await expect(runReadOnlyQuery(pgConfig, 'SELECT oops')).rejects.toThrow('syntax error')
    expect(mockAdapter.rollbackTransaction).toHaveBeenCalledOnce()
  })

  it('caps returned rows at maxRows', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ i }))
    mockAdapter.queryInTransaction
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET TRANSACTION READ ONLY
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null }) // SET LOCAL statement_timeout
      .mockResolvedValueOnce({ rows, fields: [], rowCount: 600 })

    const result = await runReadOnlyQuery(pgConfig, 'SELECT * FROM big')
    expect(result.rows).toHaveLength(MCP_MAX_ROWS)
  })

  it('falls back to plain query with keyword guard when adapter has no transactions', async () => {
    const bare = {
      dbType: 'mssql',
      query: vi.fn().mockResolvedValue({ rows: [], fields: [], rowCount: 0 })
    }
    const { getAdapter } = await import('../db-adapter')
    vi.mocked(getAdapter).mockReturnValueOnce(bare as never)

    const mssqlConfig = { ...pgConfig, dbType: 'mssql' } as ConnectionConfig
    await runReadOnlyQuery(mssqlConfig, 'SELECT 1')
    expect(bare.query).toHaveBeenCalledWith(mssqlConfig, 'SELECT 1')
  })
})
