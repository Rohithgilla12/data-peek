import { describe, it, expect } from 'vitest'
import {
  generateWhereClause,
  generateOrderByClause,
  buildQueryWithFilters,
  stripTrailingOrderBy,
  mergeWhereClause
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

describe('stripTrailingOrderBy', () => {
  it('removes a trailing ORDER BY', () => {
    expect(stripTrailingOrderBy('SELECT * FROM users ORDER BY "age" DESC')).toBe(
      'SELECT * FROM users'
    )
  })

  it('removes a multi-column trailing ORDER BY', () => {
    expect(stripTrailingOrderBy('SELECT * FROM users ORDER BY "a" ASC, "b" DESC')).toBe(
      'SELECT * FROM users'
    )
  })

  it('leaves a window function ORDER BY alone', () => {
    const sql = 'SELECT row_number() OVER (ORDER BY "age" DESC) AS rn FROM users'
    expect(stripTrailingOrderBy(sql)).toBe(sql)
  })

  it('leaves a subquery ORDER BY alone', () => {
    const sql = 'SELECT * FROM (SELECT * FROM users ORDER BY "age") AS sub'
    expect(stripTrailingOrderBy(sql)).toBe(sql)
  })

  it('strips only the outer ORDER BY when both are present', () => {
    const sql = 'SELECT row_number() OVER (ORDER BY "a") AS rn FROM users ORDER BY "b" DESC'
    expect(stripTrailingOrderBy(sql)).toBe(
      'SELECT row_number() OVER (ORDER BY "a") AS rn FROM users'
    )
  })

  it('returns the query unchanged when there is no ORDER BY', () => {
    expect(stripTrailingOrderBy('SELECT * FROM users')).toBe('SELECT * FROM users')
  })
})

describe('buildQueryWithFilters ORDER BY replacement', () => {
  const queryTab2 = (query: string): Tab => ({ type: 'query', query }) as unknown as Tab

  it('replaces an existing ORDER BY rather than appending a second one', () => {
    const result = buildQueryWithFilters({
      tab: queryTab2('SELECT * FROM wallets ORDER BY "created_at" DESC LIMIT 100'),
      dbType: 'postgresql',
      filters: [],
      sorting: [{ column: 'name', direction: 'asc' }]
    })
    expect(result).toBe('SELECT * FROM wallets ORDER BY "name" ASC LIMIT 100;')
  })

  it('drops the existing ORDER BY when the new sorting is empty', () => {
    const result = buildQueryWithFilters({
      tab: queryTab2('SELECT * FROM wallets ORDER BY "created_at" DESC LIMIT 100'),
      dbType: 'postgresql',
      filters: [],
      sorting: []
    })
    expect(result).toBe('SELECT * FROM wallets LIMIT 100;')
  })
})

describe('mergeWhereClause', () => {
  it('appends a WHERE when the query has none', () => {
    expect(mergeWhereClause('SELECT * FROM users', `WHERE "a" ILIKE '%1%'`)).toBe(
      `SELECT * FROM users WHERE "a" ILIKE '%1%'`
    )
  })

  it('ANDs into an existing WHERE', () => {
    expect(
      mergeWhereClause(`SELECT * FROM users WHERE active = true`, `WHERE "a" ILIKE '%1%'`)
    ).toBe(`SELECT * FROM users WHERE (active = true) AND ("a" ILIKE '%1%')`)
  })

  it('returns the query unchanged when the new clause is empty', () => {
    expect(mergeWhereClause('SELECT * FROM users WHERE active = true', '')).toBe(
      'SELECT * FROM users WHERE active = true'
    )
  })

  it('leaves a subquery WHERE alone', () => {
    const sql = 'SELECT * FROM (SELECT * FROM users WHERE active = true) AS sub'
    expect(mergeWhereClause(sql, `WHERE "a" ILIKE '%1%'`)).toBe(
      `SELECT * FROM (SELECT * FROM users WHERE active = true) AS sub WHERE "a" ILIKE '%1%'`
    )
  })
})

describe('buildQueryWithFilters page size', () => {
  const previewTab = (): Tab =>
    ({
      type: 'table-preview',
      schemaName: 'blocktree',
      tableName: 'wallets',
      query: 'SELECT * FROM "blocktree"."wallets" LIMIT 250;',
      savedQuery: 'SELECT * FROM "blocktree"."wallets" LIMIT 250;'
    }) as unknown as Tab

  it('uses the supplied limit instead of the hardcoded 100', () => {
    const result = buildQueryWithFilters({
      tab: previewTab(),
      dbType: 'postgresql',
      filters: [],
      sorting: [{ column: 'name', direction: 'asc' }],
      limit: 250
    })
    expect(result).toBe('SELECT * FROM "blocktree"."wallets" ORDER BY "name" ASC LIMIT 250;')
  })

  it('defaults to 100 when no limit is supplied', () => {
    const result = buildQueryWithFilters({
      tab: previewTab(),
      dbType: 'postgresql',
      filters: [],
      sorting: [{ column: 'name', direction: 'asc' }]
    })
    expect(result).toBe('SELECT * FROM "blocktree"."wallets" ORDER BY "name" ASC LIMIT 100;')
  })
})

describe('buildQueryWithFilters WHERE merging', () => {
  const queryTab3 = (query: string): Tab => ({ type: 'query', query }) as unknown as Tab

  it('does not emit two WHERE keywords', () => {
    const result = buildQueryWithFilters({
      tab: queryTab3('SELECT * FROM users WHERE active = true LIMIT 50'),
      dbType: 'postgresql',
      filters: [{ column: 'name', value: 'foo' }],
      sorting: []
    })
    expect(result).toBe(
      `SELECT * FROM users WHERE (active = true) AND ("name" ILIKE '%foo%') LIMIT 50;`
    )
  })
})

describe('top-level clause detection', () => {
  const queryTab4 = (query: string): Tab => ({ type: 'query', query }) as unknown as Tab

  it('strips the outer ORDER BY when a subquery ORDER BY comes first', () => {
    const sql = 'SELECT * FROM (SELECT * FROM users ORDER BY "a") AS sub ORDER BY "b" DESC'
    expect(stripTrailingOrderBy(sql)).toBe(
      'SELECT * FROM (SELECT * FROM users ORDER BY "a") AS sub'
    )
  })

  it('ignores an ORDER BY inside a string literal', () => {
    const sql = `SELECT * FROM users WHERE note = ' ORDER BY x '`
    expect(stripTrailingOrderBy(sql)).toBe(sql)
  })

  it('ANDs into the outer WHERE when a subquery WHERE comes first', () => {
    const sql = 'SELECT * FROM (SELECT * FROM users WHERE active = true) AS sub WHERE "b" = 1'
    expect(mergeWhereClause(sql, `WHERE "a" ILIKE '%1%'`)).toBe(
      'SELECT * FROM (SELECT * FROM users WHERE active = true) AS sub ' +
        `WHERE ("b" = 1) AND ("a" ILIKE '%1%')`
    )
  })

  it('keeps GROUP BY and HAVING outside the merged predicate', () => {
    const sql = 'SELECT dept, count(*) FROM t WHERE a = 1 GROUP BY dept HAVING count(*) > 1'
    expect(mergeWhereClause(sql, `WHERE "n" ILIKE '%x%'`)).toBe(
      `SELECT dept, count(*) FROM t WHERE (a = 1) AND ("n" ILIKE '%x%') ` +
        'GROUP BY dept HAVING count(*) > 1'
    )
  })

  it('keeps a trailing ORDER BY outside the merged predicate', () => {
    const sql = 'SELECT * FROM t WHERE a = 1 ORDER BY b'
    expect(mergeWhereClause(sql, `WHERE "n" ILIKE '%x%'`)).toBe(
      `SELECT * FROM t WHERE (a = 1) AND ("n" ILIKE '%x%') ORDER BY b`
    )
  })

  it('preserves LIMIT with OFFSET and places ORDER BY before it', () => {
    const result = buildQueryWithFilters({
      tab: queryTab4('SELECT * FROM wallets ORDER BY "created_at" DESC LIMIT 100 OFFSET 20'),
      dbType: 'postgresql',
      filters: [],
      sorting: [{ column: 'name', direction: 'asc' }]
    })
    expect(result).toBe('SELECT * FROM wallets ORDER BY "name" ASC LIMIT 100 OFFSET 20;')
  })

  it('preserves a parenthesised MSSQL TOP', () => {
    const result = buildQueryWithFilters({
      tab: queryTab4('SELECT TOP (100) * FROM wallets'),
      dbType: 'mssql',
      filters: [],
      sorting: [{ column: 'name', direction: 'asc' }]
    })
    expect(result).toBe('SELECT TOP (100) * FROM wallets ORDER BY [name] ASC;')
  })
})
