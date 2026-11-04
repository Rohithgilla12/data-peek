import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

const mockAdapter = {
  dbType: 'postgresql',
  queryReadOnly: vi.fn()
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

  it.each([
    [
      'a COMMIT that would end the rolled-back transaction',
      "SELECT 1 COMMIT WRITETEXT t.c @p N'x'"
    ],
    ['ROLLBACK inside a batch', 'SELECT 1 ROLLBACK'],
    ['BEGIN TRAN inside a batch', 'SELECT 1 BEGIN TRAN'],
    ['UPDATETEXT', "SELECT 1 UPDATETEXT t.c @p 0 NULL N'x'"],
    ['NEXT VALUE FOR, which a rollback does not undo', 'SELECT NEXT VALUE FOR dbo.seq']
  ])('rejects %s on SQL Server', (_label, sql) => {
    expect(() => assertSingleReadStatement(sql, 'mssql')).toThrow(/read-only/i)
  })

  it('still accepts identifiers that merely contain those words', () => {
    const sql = 'SELECT begin_at, committed_by FROM rollbacks_log'
    expect(assertSingleReadStatement(sql, 'mssql')).toBe(sql)
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
    mockAdapter.queryReadOnly.mockResolvedValue({ rows: [], fields: [], rowCount: 0 })
  })

  it("runs the statement through the adapter's read-only path with a timeout", async () => {
    await runReadOnlyQuery(pgConfig, '  SELECT 1  ', { executionId: 'exec-1' })
    expect(mockAdapter.queryReadOnly).toHaveBeenCalledWith(pgConfig, 'SELECT 1', {
      timeoutMs: 30_000,
      maxRows: MCP_MAX_ROWS,
      executionId: 'exec-1'
    })
  })

  it('caps returned rows at maxRows, and maxRows at MCP_MAX_ROWS', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ i }))
    mockAdapter.queryReadOnly.mockResolvedValue({ rows, fields: [], rowCount: 600 })
    expect((await runReadOnlyQuery(pgConfig, 'SELECT * FROM big')).rows).toHaveLength(MCP_MAX_ROWS)
    expect((await runReadOnlyQuery(pgConfig, 'SELECT 1', { maxRows: 2 })).rows).toHaveLength(2)
    expect(mockAdapter.queryReadOnly).toHaveBeenLastCalledWith(
      pgConfig,
      'SELECT 1',
      expect.objectContaining({ maxRows: 2 })
    )
  })

  it('refuses a write before it reaches the database', async () => {
    await expect(runReadOnlyQuery(pgConfig, 'DELETE FROM users')).rejects.toThrow(/read-only/i)
    expect(mockAdapter.queryReadOnly).not.toHaveBeenCalled()
  })

  it('passes adapter errors through', async () => {
    mockAdapter.queryReadOnly.mockRejectedValue(new Error('syntax error'))
    await expect(runReadOnlyQuery(pgConfig, 'SELECT oops')).rejects.toThrow('syntax error')
  })
})
