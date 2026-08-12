import { describe, it, expect } from 'vitest'
import { getSortScope } from '@/lib/sort-scope'
import type { Tab } from '@/stores/tab-store'

const preview = (over: Record<string, unknown> = {}): Tab =>
  ({
    type: 'table-preview',
    schemaName: 'blocktree',
    tableName: 'wallets',
    query: 'SELECT * FROM "blocktree"."wallets" LIMIT 250;',
    savedQuery: 'SELECT * FROM "blocktree"."wallets" LIMIT 250;',
    totalRowCount: 646,
    ...over
  }) as unknown as Tab

const query = (sql: string): Tab => ({ type: 'query', query: sql }) as unknown as Tab

describe('getSortScope', () => {
  it('reports server scope for a table preview whose SQL still matches', () => {
    expect(getSortScope({ tab: preview(), dbType: 'postgresql', loadedRows: 250 })).toEqual({
      kind: 'server'
    })
  })

  it('falls back to the query-tab path when the preview SQL was rewritten', () => {
    const rewritten = preview({
      query: 'SELECT * FROM "blocktree"."actions" LIMIT 250;',
      savedQuery: 'SELECT * FROM "blocktree"."actions" LIMIT 250;'
    })
    expect(getSortScope({ tab: rewritten, dbType: 'postgresql', loadedRows: 250 })).toEqual({
      kind: 'partial',
      loaded: 250,
      total: null
    })
  })

  it('reports complete when a query returns fewer rows than its LIMIT', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 100'),
        dbType: 'postgresql',
        loadedRows: 84
      })
    ).toEqual({ kind: 'complete', rows: 84 })
  })

  it('reports partial with an unknown total when a query exactly fills its LIMIT', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 100'),
        dbType: 'postgresql',
        loadedRows: 100
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null })
  })

  it('reports complete when a query has no LIMIT', () => {
    expect(
      getSortScope({ tab: query('SELECT * FROM users'), dbType: 'postgresql', loadedRows: 512 })
    ).toEqual({ kind: 'complete', rows: 512 })
  })

  it('reports complete for an MSSQL TOP that is under-filled', () => {
    expect(
      getSortScope({ tab: query('SELECT TOP 100 * FROM users'), dbType: 'mssql', loadedRows: 12 })
    ).toEqual({ kind: 'complete', rows: 12 })
  })

  it('reports partial for an MSSQL TOP that is exactly filled', () => {
    expect(
      getSortScope({ tab: query('SELECT TOP 100 * FROM users'), dbType: 'mssql', loadedRows: 100 })
    ).toEqual({ kind: 'partial', loaded: 100, total: null })
  })

  it('reports complete for a non-executable tab', () => {
    const erd = { type: 'erd' } as unknown as Tab
    expect(getSortScope({ tab: erd, dbType: 'postgresql', loadedRows: 0 })).toEqual({
      kind: 'complete',
      rows: 0
    })
  })
})
