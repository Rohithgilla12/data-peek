import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchInsertOptions, ConnectionConfig } from '@shared/index'
import type { DatabaseAdapter } from '../db-adapter'
import {
  batchInsert,
  buildInsertSql,
  buildPlaceholders,
  effectiveBatchSize,
  resetCancelBatchInsert
} from '../batch-insert'

const config = { dbType: 'mssql' } as ConnectionConfig & { dbType: 'mssql' }

function makeOptions(columns: string[]): BatchInsertOptions {
  return {
    schema: 'dbo',
    table: 'items',
    columns,
    onConflict: 'error'
  }
}

beforeEach(() => {
  resetCancelBatchInsert()
})

describe('effectiveBatchSize', () => {
  it.each([
    ['mssql', 20, 500, 104],
    ['mssql', 2, 2000, 1000],
    ['postgresql', 20, 5000, 3276],
    ['mysql', 1, 70000, 65535],
    ['sqlite', 2, 500, 499]
  ] as const)('%s clamps %i columns at %i rows to %i', (dialect, columnCount, requested, expected) => {
    expect(effectiveBatchSize(dialect, columnCount, requested)).toBe(expected)
  })

  it('uses one row when the requested batch size is not positive', () => {
    expect(effectiveBatchSize('mssql', 2, 0)).toBe(1)
  })

  it('rejects a row that cannot fit within the dialect parameter limit', () => {
    expect(() => effectiveBatchSize('sqlite', 1000, 500)).toThrow(RangeError)
  })
})

describe('insert SQL builders', () => {
  it('exports placeholders with per-row parameter numbering', () => {
    expect(buildPlaceholders('postgresql', 2, 1)).toBe('$3, $4')
    expect(buildPlaceholders('mssql', 2, 1)).toBe('@p3, @p4')
    expect(buildPlaceholders('sqlite', 2, 1)).toBe('?, ?')
  })

  it('builds an insert with placeholders numbered across rows', () => {
    const sql = buildInsertSql(
      'mssql',
      '[items]',
      ['id', 'name'],
      [
        [1, 'first'],
        [2, 'second']
      ],
      'error',
      []
    )

    expect(sql).toContain('VALUES (@p1, @p2), (@p3, @p4)')
  })
})

describe('batchInsert parameter limits', () => {
  it('restarts placeholders for each split statement', async () => {
    const sqlStatements: string[] = []
    const adapter = {
      dbType: 'mssql',
      execute: vi.fn(async (_config: ConnectionConfig, sql: string) => {
        sqlStatements.push(sql)
        return { rowCount: null }
      })
    } as unknown as DatabaseAdapter

    const result = await batchInsert(
      adapter,
      config,
      [
        [1, 'first'],
        [2, 'second'],
        [3, 'third']
      ],
      makeOptions(['id', 'name']),
      2
    )

    expect(result.rowsInserted).toBe(3)
    expect(sqlStatements).toHaveLength(2)
    expect(sqlStatements[0]).toContain('VALUES (@p1, @p2), (@p3, @p4)')
    expect(sqlStatements[1]).toContain('VALUES (@p1, @p2)')
  })

  it('imports 5,000 rows with 20 columns without exceeding SQL Server limits', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const columns = Array.from({ length: 20 }, (_, index) => `c${index}`)
    const rows = Array.from({ length: 5000 }, (_, rowIndex) =>
      columns.map((_, columnIndex) => rowIndex + columnIndex)
    )
    const adapter = {
      dbType: 'mssql',
      execute: vi.fn(async (_config: ConnectionConfig, sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return { rowCount: null }
      })
    } as unknown as DatabaseAdapter

    const result = await batchInsert(adapter, config, rows, makeOptions(columns), 500)

    const insertedRows = calls.reduce(
      (count, call) => count + (call.sql.match(/\), \(/g)?.length ?? 0) + 1,
      0
    )
    expect(result.rowsInserted).toBe(5000)
    expect(calls).toHaveLength(Math.ceil(5000 / 104))
    expect(insertedRows).toBe(5000)
    expect(calls.every((call) => call.params.length <= 2098)).toBe(true)
    expect(calls.every((call) => (call.sql.match(/\), \(/g)?.length ?? 0) + 1 <= 1000)).toBe(true)
  })

  it('reports progress where totalBatches matches the clamped batch count', async () => {
    const progressCalls: Array<{
      inserted: number
      total: number
      batch: number
      totalBatches: number
    }> = []
    const columns = Array.from({ length: 20 }, (_, index) => `c${index}`)
    const rows = Array.from({ length: 5000 }, (_, rowIndex) =>
      columns.map((_, columnIndex) => rowIndex + columnIndex)
    )
    const adapter = {
      dbType: 'mssql',
      execute: vi.fn(async () => ({ rowCount: null }))
    } as unknown as DatabaseAdapter

    await batchInsert(
      adapter,
      config,
      rows,
      makeOptions(columns),
      500,
      (inserted, total, batch, totalBatches) => {
        progressCalls.push({ inserted, total, batch, totalBatches })
      }
    )

    expect(progressCalls).toHaveLength(49)
    expect(progressCalls[0]).toEqual({
      inserted: 104,
      total: 5000,
      batch: 1,
      totalBatches: 49
    })
    expect(progressCalls[progressCalls.length - 1]).toEqual({
      inserted: 5000,
      total: 5000,
      batch: 49,
      totalBatches: 49
    })
    expect(progressCalls.every((p) => p.totalBatches === 49)).toBe(true)
  })
})
