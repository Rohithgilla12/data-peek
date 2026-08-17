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
      total: null,
      serverSortable: true
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
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
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
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
  })

  it('reports complete for a non-executable tab', () => {
    const erd = { type: 'erd' } as unknown as Tab
    expect(getSortScope({ tab: erd, dbType: 'postgresql', loadedRows: 0 })).toEqual({
      kind: 'complete',
      rows: 0
    })
  })
})

describe('declaredRowCap paginated forms', () => {
  it('detects a LIMIT that carries an OFFSET', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 100 OFFSET 20'),
        dbType: 'postgresql',
        loadedRows: 100
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
  })

  it("detects MySQL's two-argument LIMIT", () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 20, 100'),
        dbType: 'mysql',
        loadedRows: 100
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
  })

  it('detects a parenthesised MSSQL TOP', () => {
    expect(
      getSortScope({
        tab: query('SELECT TOP (100) * FROM users'),
        dbType: 'mssql',
        loadedRows: 100
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
  })

  it('detects FETCH FIRST n ROWS ONLY', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users OFFSET 0 ROWS FETCH FIRST 100 ROWS ONLY'),
        dbType: 'postgresql',
        loadedRows: 100
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: true })
  })

  it('still reports complete when the rows fall short of the cap', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 100 OFFSET 20'),
        dbType: 'postgresql',
        loadedRows: 84
      })
    ).toEqual({ kind: 'complete', rows: 84 })
  })
})

describe('sorts that SQL cannot express', () => {
  const plain = { mode: 'default' as const, nullsPosition: 'last' as const }

  it('keeps server scope for a table preview sorted plainly', () => {
    expect(
      getSortScope({ tab: preview(), dbType: 'postgresql', loadedRows: 250, sorting: [plain] })
    ).toEqual({ kind: 'server' })
  })

  it('drops a table preview to partial when a chip uses a non-default mode', () => {
    expect(
      getSortScope({
        tab: preview(),
        dbType: 'postgresql',
        loadedRows: 250,
        sorting: [{ mode: 'random', nullsPosition: 'last' }]
      })
    ).toEqual({ kind: 'partial', loaded: 250, total: 646, serverSortable: false })
  })

  it('drops a table preview to partial when nulls are placed explicitly first', () => {
    expect(
      getSortScope({
        tab: preview(),
        dbType: 'postgresql',
        loadedRows: 250,
        sorting: [{ mode: 'default', nullsPosition: 'first' }]
      })
    ).toEqual({ kind: 'partial', loaded: 250, total: 646, serverSortable: false })
  })

  it('drops server scope when only one chip of several is inexpressible', () => {
    expect(
      getSortScope({
        tab: preview(),
        dbType: 'postgresql',
        loadedRows: 250,
        sorting: [plain, { mode: 'byMonth', nullsPosition: 'last' }]
      })
    ).toMatchObject({ kind: 'partial', serverSortable: false })
  })

  it('marks a capped query tab unsortable on the server for a non-default mode', () => {
    expect(
      getSortScope({
        tab: query('SELECT * FROM users LIMIT 100'),
        dbType: 'postgresql',
        loadedRows: 100,
        sorting: [{ mode: 'length', nullsPosition: 'last' }]
      })
    ).toEqual({ kind: 'partial', loaded: 100, total: null, serverSortable: false })
  })

  it('treats an absent mode as a plain sort', () => {
    expect(
      getSortScope({
        tab: preview(),
        dbType: 'postgresql',
        loadedRows: 250,
        sorting: [{ column: 'name', direction: 'asc' } as never]
      })
    ).toEqual({ kind: 'server' })
  })
})
