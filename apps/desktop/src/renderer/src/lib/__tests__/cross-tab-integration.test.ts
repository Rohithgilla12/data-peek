import { describe, it, expect } from 'vitest'
import {
  toSQLDialect,
  mapTabToResolvable,
  buildTabLookup,
  resolveForRun,
  buildCrossTabRefs,
  crossTabErrorMessage
} from '../cross-tab-integration'
import type { QueryTab, Tab } from '../../stores/tab-store'

function qtab(id: string, connectionId: string | null, o: Partial<QueryTab> = {}): QueryTab {
  return {
    id, type: 'query', title: 'Query', isPinned: false, connectionId,
    createdAt: 0, order: 0, query: '', savedQuery: '',
    result: null, multiResult: null, activeResultIndex: 0, error: null,
    isExecuting: false, executionId: null, currentPage: 1, pageSize: 100, ...o
  }
}

const RES = {
  columns: [{ name: 'id', dataType: 'integer' }, { name: 'email', dataType: 'text' }],
  rows: [{ id: 1, email: 'a@x.com' }, { id: 2, email: 'b@x.com' }],
  rowCount: 2,
  durationMs: 1
}

describe('toSQLDialect', () => {
  it('maps database types to escaper dialects (sqlite → standard)', () => {
    expect(toSQLDialect('postgresql')).toBe('postgresql')
    expect(toSQLDialect('mysql')).toBe('mysql')
    expect(toSQLDialect('mssql')).toBe('mssql')
    expect(toSQLDialect('sqlite')).toBe('standard')
  })
})

describe('mapTabToResolvable', () => {
  it('maps a successful legacy result to kind:success with fields from columns', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u', result: RES }))
    expect(r.result.kind).toBe('success')
    if (r.result.kind !== 'success') return
    expect(r.result.rows).toHaveLength(2)
    expect(r.result.fields).toEqual(RES.columns)
  })

  it('prefers the active multiResult statement over legacy result', () => {
    const tab = qtab('a', 'c1', {
      name: 'u',
      result: RES,
      activeResultIndex: 1,
      multiResult: {
        statements: [
          { rows: [], fields: [], rowCount: 0 },
          { rows: [{ x: 9 }], fields: [{ name: 'x', dataType: 'integer' }], rowCount: 1 }
        ],
        totalDurationMs: 1,
        statementCount: 2
      } as unknown as QueryTab['multiResult']
    })
    const r = mapTabToResolvable(tab)
    expect(r.result.kind).toBe('success')
    if (r.result.kind !== 'success') return
    expect(r.result.rows).toEqual([{ x: 9 }])
  })

  it('maps an error to kind:error', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u', error: 'boom' }))
    expect(r.result).toEqual({ kind: 'error', message: 'boom' })
  })

  it('maps a never-run tab to kind:none', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u' }))
    expect(r.result).toEqual({ kind: 'none' })
  })
})

describe('buildTabLookup', () => {
  const tabs: Tab[] = [
    qtab('a', 'c1', { name: 'recent', result: RES }),
    qtab('b', 'c1'),
    qtab('c', 'c2', { name: 'recent', result: RES }),
    qtab('self', 'c1', { name: 'me', result: RES })
  ]
  it('finds a named tab on the same connection', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    expect(lookup('recent')?.tabId).toBe('a')
  })
  it('does not cross connections', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    expect(lookup('recent')?.tabId).toBe('a')
  })
  it('excludes the current tab (no self-reference via lookup)', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'self')
    expect(lookup('me')).toBeNull()
  })
  it('returns null for an unknown name', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    expect(lookup('nope')).toBeNull()
  })
})

describe('resolveForRun', () => {
  const tabs: Tab[] = [qtab('a', 'c1', { name: 'active_users', result: RES })]

  it('passes through SQL with no references', () => {
    const r = resolveForRun('SELECT 1', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toBe('SELECT 1')
    expect(r.summary.refCount).toBe(0)
  })

  it('resolves a reference into a CTE (postgres)', () => {
    const r = resolveForRun('SELECT * FROM @active_users', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toContain('WITH')
    expect(r.finalSql).toContain('active_users')
    expect(r.finalSql).not.toContain('@active_users')
    expect(r.summary.refCount).toBe(1)
    expect(r.summary.rowsInlined).toBe(2)
  })

  it('resolves across all dialects without throwing', () => {
    for (const dbType of ['postgresql', 'mysql', 'mssql', 'sqlite'] as const) {
      const r = resolveForRun('SELECT * FROM @active_users', { dbType, connectionId: 'c1', currentTabId: 'b', tabs })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.finalSql).not.toContain('@active_users')
    }
  })

  it('reports unknown_reference on postgres for a missing name', () => {
    const r = resolveForRun('SELECT * FROM @ghost', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('unknown_reference')
  })

  it('on mysql, ignores @vars that are not named tabs (no error)', () => {
    const r = resolveForRun('SELECT @offset, * FROM @active_users', { dbType: 'mysql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toContain('@offset')
    expect(r.finalSql).not.toContain('@active_users')
  })
})

describe('buildCrossTabRefs', () => {
  it('summarizes named query tabs on the connection (excluding current)', () => {
    const tabs: Tab[] = [
      qtab('a', 'c1', { name: 'active_users', title: 'Users', result: RES }),
      qtab('b', 'c1', { name: 'pending' }),
      qtab('cur', 'c1', { name: 'self', result: RES })
    ]
    const refs = buildCrossTabRefs(tabs, 'c1', 'cur')
    expect(refs).toEqual([
      { name: 'active_users', tabTitle: 'Users', rowCount: 2, colCount: 2, hasResult: true },
      { name: 'pending', tabTitle: 'Query', rowCount: 0, colCount: 0, hasResult: false }
    ])
  })
})

describe('crossTabErrorMessage', () => {
  it('renders each error kind', () => {
    expect(crossTabErrorMessage({ kind: 'unknown_reference', name: 'x' })).toBe('No tab named @x on this connection.')
    expect(crossTabErrorMessage({ kind: 'no_result', name: 'x' })).toContain("hasn't been run")
    expect(crossTabErrorMessage({ kind: 'circular', chain: ['x'] })).toContain('reference itself')
    expect(crossTabErrorMessage({ kind: 'too_large', name: 'x', rows: 5, bytes: 1, cap: { rows: 4, bytes: 9 } })).toContain('cap 4')
    expect(crossTabErrorMessage({ kind: 'too_many_columns', name: 'x', columns: 200, cap: 100 })).toContain('200 columns')
    expect(crossTabErrorMessage({ kind: 'duplicate_cte_name', name: 'x' })).toContain('collides')
    expect(crossTabErrorMessage({ kind: 'errored_result', name: 'x', error: 'oops' })).toContain('oops')
  })
})
