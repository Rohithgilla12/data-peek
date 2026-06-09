import { describe, it, expect } from 'vitest'
import {
  generateWhereClause,
  generateOrderByClause,
  buildQueryWithFilters
} from '@/lib/table-query-builder'
import type { Tab } from '@/stores/tab-store'

describe('generateWhereClause', () => {
  it('returns an empty string when there are no filters', () => {
    expect(generateWhereClause([], 'postgresql')).toBe('')
  })

  it('builds a case-insensitive ILIKE clause for postgres', () => {
    expect(generateWhereClause([{ column: 'name', value: 'foo' }], 'postgresql')).toBe(
      `WHERE "name" ILIKE '%foo%'`
    )
  })

  it('uses LIKE and backtick quoting for mysql', () => {
    expect(generateWhereClause([{ column: 'name', value: 'foo' }], 'mysql')).toBe(
      "WHERE `name` LIKE '%foo%'"
    )
  })

  it('uses LIKE and bracket quoting for mssql', () => {
    expect(generateWhereClause([{ column: 'name', value: 'foo' }], 'mssql')).toBe(
      `WHERE [name] LIKE '%foo%'`
    )
  })

  it('escapes single quotes in the value', () => {
    expect(generateWhereClause([{ column: 'name', value: "O'Brien" }], 'postgresql')).toBe(
      `WHERE "name" ILIKE '%O''Brien%'`
    )
  })

  it('joins multiple filters with AND', () => {
    expect(
      generateWhereClause(
        [
          { column: 'a', value: '1' },
          { column: 'b', value: '2' }
        ],
        'postgresql'
      )
    ).toBe(`WHERE "a" ILIKE '%1%' AND "b" ILIKE '%2%'`)
  })
})

describe('generateOrderByClause', () => {
  it('returns an empty string when there is no sorting', () => {
    expect(generateOrderByClause([], 'postgresql')).toBe('')
  })

  it('builds an ORDER BY with the direction uppercased', () => {
    expect(generateOrderByClause([{ column: 'age', direction: 'desc' }], 'postgresql')).toBe(
      `ORDER BY "age" DESC`
    )
  })

  it('joins multiple sorts with commas', () => {
    expect(
      generateOrderByClause(
        [
          { column: 'a', direction: 'asc' },
          { column: 'b', direction: 'desc' }
        ],
        'postgresql'
      )
    ).toBe(`ORDER BY "a" ASC, "b" DESC`)
  })
})

describe('buildQueryWithFilters', () => {
  const queryTab = (query: string): Tab => ({ type: 'query', query }) as unknown as Tab

  it('returns an empty string for a non-executable tab', () => {
    const erd = { type: 'erd' } as unknown as Tab
    expect(
      buildQueryWithFilters({ tab: erd, dbType: 'postgresql', filters: [], sorting: [] })
    ).toBe('')
  })

  it('injects WHERE/ORDER BY into a query tab and preserves an existing LIMIT', () => {
    const result = buildQueryWithFilters({
      tab: queryTab('SELECT * FROM users LIMIT 100'),
      dbType: 'postgresql',
      filters: [{ column: 'name', value: 'foo' }],
      sorting: [{ column: 'age', direction: 'desc' }]
    })
    expect(result).toBe(
      `SELECT * FROM users WHERE "name" ILIKE '%foo%' ORDER BY "age" DESC LIMIT 100;`
    )
  })

  it('preserves a leading TOP clause for mssql', () => {
    const result = buildQueryWithFilters({
      tab: queryTab('SELECT TOP 100 * FROM users'),
      dbType: 'mssql',
      filters: [{ column: 'name', value: 'foo' }],
      sorting: [{ column: 'age', direction: 'desc' }]
    })
    expect(result).toBe(
      `SELECT TOP 100 * FROM users WHERE [name] LIKE '%foo%' ORDER BY [age] DESC;`
    )
  })
})
