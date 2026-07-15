import { describe, it, expect } from 'vitest'
import { resolveReferences, type ResolvableTab } from '../cross-tab-resolver'
import { parseTabReferences } from '../cross-tab-parser'
import type { DatabaseType } from '@data-peek/shared'

const successTab = (
  name: string,
  rows: Array<Record<string, unknown>>,
  fields: Array<{ name: string; dataType: string }>
): ResolvableTab => ({
  tabId: `tab-${name}`,
  name,
  result: { kind: 'success', rows, fields }
})

const errorTab = (name: string, message: string): ResolvableTab => ({
  tabId: `tab-${name}`,
  name,
  result: { kind: 'error', message }
})

const emptyTab = (name: string): ResolvableTab => ({
  tabId: `tab-${name}`,
  name,
  result: { kind: 'none' }
})

const makeLookup = (tabs: ResolvableTab[]) => (name: string) =>
  tabs.find((t) => t.name === name) ?? null

function parse(sql: string, dialect: DatabaseType = 'postgresql') {
  return parseTabReferences(sql, { dialect })
}

describe('resolveReferences', () => {
  describe('happy paths', () => {
    it('no references → source unchanged', () => {
      const sql = 'SELECT * FROM users'
      const r = resolveReferences(sql, parse(sql), {
        lookup: () => null,
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.result.finalSql).toBe(sql)
        expect(r.result.prependedCtes).toHaveLength(0)
      }
    })

    it('one reference → CTE prepended with WITH and identifier substitution', () => {
      const sql = 'SELECT * FROM @active_users'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab(
            'active_users',
            [
              { id: 1, email: 'a@x.com' },
              { id: 2, email: 'b@x.com' }
            ],
            [
              { name: 'id', dataType: 'integer' },
              { name: 'email', dataType: 'text' }
            ]
          )
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.finalSql).toContain('WITH')
      expect(r.result.finalSql).toContain('active_users')
      expect(r.result.finalSql).toContain('VALUES')
      expect(r.result.finalSql).toContain('SELECT * FROM active_users')
      expect(r.result.finalSql).not.toContain('@active_users')
      expect(r.result.rowsInlined).toBe(2)
    })

    it('emits PG type casts on the first VALUES tuple', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab(
            't',
            [
              { id: 1, name: 'a' },
              { id: 2, name: 'b' }
            ],
            [
              { name: 'id', dataType: 'integer' },
              { name: 'name', dataType: 'text' }
            ]
          )
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/::integer/)
      expect(r.result.prependedCtes[0]).toMatch(/::text/)
    })

    it('multiple distinct references → multiple CTEs in alphabetical order', () => {
      const sql = 'SELECT * FROM @users JOIN @orders USING(user_id)'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('users', [{ user_id: 1 }], [{ name: 'user_id', dataType: 'integer' }]),
          successTab(
            'orders',
            [{ user_id: 1, amount: 99 }],
            [
              { name: 'user_id', dataType: 'integer' },
              { name: 'amount', dataType: 'numeric' }
            ]
          )
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const ordersIdx = r.result.finalSql.indexOf('orders(')
      const usersIdx = r.result.finalSql.indexOf('users(')
      expect(ordersIdx).toBeGreaterThan(0)
      expect(ordersIdx).toBeLessThan(usersIdx)
    })

    it('repeated references emit only one CTE', () => {
      const sql = 'SELECT * FROM @t a JOIN @t b ON a.id < b.id'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('t', [{ id: 1 }, { id: 2 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes).toHaveLength(1)
      expect(r.result.finalSql.indexOf('t a')).toBeGreaterThan(0)
      expect(r.result.finalSql.indexOf('t b')).toBeGreaterThan(0)
    })

    it('empty result emits a defensible WHERE FALSE CTE (PG)', () => {
      const sql = 'SELECT * FROM @empty'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([successTab('empty', [], [{ name: 'id', dataType: 'integer' }])]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/WHERE FALSE/)
      expect(r.result.rowsInlined).toBe(0)
    })

    it('merges into an existing WITH clause when present', () => {
      const sql = 'WITH high AS (SELECT 1) SELECT * FROM @users, high'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('users', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const final = r.result.finalSql
      expect(final.indexOf('WITH')).toBe(0)
      expect(final.indexOf('users(')).toBeLessThan(final.indexOf('high AS'))
    })
  })

  describe('dialect-specific CTE shapes', () => {
    it('MySQL emits VALUES ROW(...) tuples', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql, 'mysql'), {
        lookup: makeLookup([
          successTab(
            't',
            [
              { id: 1, name: 'a' },
              { id: 2, name: 'b' }
            ],
            [
              { name: 'id', dataType: 'integer' },
              { name: 'name', dataType: 'varchar' }
            ]
          )
        ]),
        currentTabId: 'main',
        dialect: 'mysql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/VALUES\s+ROW\(/)
      // Should NOT carry PG-style :: casts.
      expect(r.result.prependedCtes[0]).not.toMatch(/::integer/)
    })

    it('MSSQL wraps VALUES in SELECT * FROM derived table', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql, 'mssql'), {
        lookup: makeLookup([
          successTab('t', [{ id: 1 }, { id: 2 }], [{ name: 'id', dataType: 'int' }])
        ]),
        currentTabId: 'main',
        dialect: 'mssql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const cte = r.result.prependedCtes[0]
      expect(cte).toMatch(/SELECT \* FROM \(VALUES/)
      expect(cte).toMatch(/\) AS _\(/)
    })

    it('MSSQL empty CTE uses WHERE 1 = 0 (no FALSE literal)', () => {
      const sql = 'SELECT * FROM @empty'
      const r = resolveReferences(sql, parse(sql, 'mssql'), {
        lookup: makeLookup([successTab('empty', [], [{ name: 'id', dataType: 'int' }])]),
        currentTabId: 'main',
        dialect: 'mssql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/WHERE 1 = 0/)
      expect(r.result.prependedCtes[0]).not.toMatch(/FALSE/)
    })

    it('MySQL empty CTE uses WHERE FALSE inside a SELECT subquery', () => {
      const sql = 'SELECT * FROM @empty'
      const r = resolveReferences(sql, parse(sql, 'mysql'), {
        lookup: makeLookup([successTab('empty', [], [{ name: 'id', dataType: 'integer' }])]),
        currentTabId: 'main',
        dialect: 'mysql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/WHERE FALSE/)
    })

    it('mysql identifier quoting uses backticks', () => {
      const sql = 'SELECT * FROM @select_data'
      const r = resolveReferences(sql, parse(sql, 'mysql'), {
        lookup: makeLookup([
          successTab('select_data', [{ order: 1 }], [{ name: 'order', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'mysql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toContain('`order`')
    })
  })

  describe('WITH RECURSIVE handling', () => {
    it('preserves RECURSIVE modifier when merging', () => {
      const sql =
        'WITH RECURSIVE chain(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM chain WHERE n < 10) SELECT * FROM @users, chain'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('users', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const final = r.result.finalSql
      // Should still start with WITH RECURSIVE, ours injected between
      // RECURSIVE and the user's chain CTE.
      expect(final).toMatch(/^WITH\s+RECURSIVE\b/)
      const ourIdx = final.indexOf('users(')
      const userIdx = final.indexOf('chain(n)')
      expect(ourIdx).toBeGreaterThan(0)
      expect(ourIdx).toBeLessThan(userIdx)
    })

    it('skips leading block comment when detecting WITH', () => {
      const sql = '/* hint */ WITH user_cte AS (SELECT 1) SELECT * FROM @users, user_cte'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('users', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const final = r.result.finalSql
      // Exactly one WITH keyword should appear at the top level.
      const matches = final.match(/\bWITH\b/g) ?? []
      expect(matches.length).toBe(1)
    })
  })

  describe('NaN / Infinity handling (PG)', () => {
    it('does not double-cast NaN against an integer column', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('t', [{ x: NaN }, { x: 1 }], [{ name: 'x', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // The cell should be `'NaN'::float` from escapeSQLValue with NO
      // additional `::integer` appended.
      expect(r.result.prependedCtes[0]).toMatch(/'NaN'::float/)
      expect(r.result.prependedCtes[0]).not.toMatch(/'NaN'::float::integer/)
    })

    it('does not double-cast Infinity', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('t', [{ x: Number.POSITIVE_INFINITY }], [{ name: 'x', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).not.toMatch(/'Infinity'::float::integer/)
    })

    it('first-tuple NULL uses CAST(NULL AS type)', () => {
      const sql = 'SELECT * FROM @t'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('t', [{ id: null }, { id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toMatch(/CAST\(NULL AS integer\)/)
    })
  })

  describe('errors', () => {
    it('unknown reference', () => {
      const sql = 'SELECT * FROM @xyz'
      const r = resolveReferences(sql, parse(sql), {
        lookup: () => null,
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('unknown_reference')
    })

    it('refuses ref name that collides with a SQL keyword', () => {
      // `table` is in the shared isSQLKeyword set, so even if a tab is
      // registered with that name, the resolver refuses upfront.
      const sql = 'SELECT * FROM @table'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('table', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('unknown_reference')
    })

    it('referenced tab has no result yet', () => {
      const sql = 'SELECT * FROM @pending'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([emptyTab('pending')]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('no_result')
    })

    it('referenced tab errored on its last run', () => {
      const sql = 'SELECT * FROM @broken'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([errorTab('broken', 'syntax error at or near "frm"')]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('errored_result')
    })

    it('self-reference flagged as circular with single-name chain', () => {
      const sql = 'SELECT * FROM @me'
      const r = resolveReferences(sql, parse(sql), {
        lookup: () => ({
          tabId: 'main',
          name: 'me',
          result: { kind: 'success', rows: [], fields: [] }
        }),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('circular')
      if (r.error.kind === 'circular') {
        expect(r.error.chain).toEqual(['me'])
      }
    })

    it('row cap exceeded', () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({ id: i }))
      const sql = 'SELECT * FROM @big'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([successTab('big', rows, [{ name: 'id', dataType: 'integer' }])]),
        currentTabId: 'main',
        dialect: 'postgresql',
        caps: { maxRowsPerRef: 10 }
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('too_large')
    })

    it('column cap exceeded', () => {
      const fields = Array.from({ length: 5 }, (_, i) => ({
        name: `c${i}`,
        dataType: 'text'
      }))
      const rows = [Object.fromEntries(fields.map((f) => [f.name, 'x']))]
      const sql = 'SELECT * FROM @wide'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([successTab('wide', rows, fields)]),
        currentTabId: 'main',
        dialect: 'postgresql',
        caps: { maxColumnsPerRef: 3 }
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('too_many_columns')
    })

    it('byte cap exceeded — error reports running total, not the triggering CTE alone', () => {
      // Two CTEs that individually fit under 150 bytes but together exceed
      // it. Resolver should report the cumulative bytes at the point of
      // failure, not just the triggering CTE's own size.
      const sql = 'SELECT * FROM @alpha, @beta'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('alpha', [{ note: 'x'.repeat(60) }], [{ name: 'note', dataType: 'text' }]),
          successTab('beta', [{ note: 'y'.repeat(60) }], [{ name: 'note', dataType: 'text' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql',
        caps: { maxBytesTotal: 150 }
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('too_large')
      if (r.error.kind === 'too_large') {
        expect(r.error.bytes).toBeGreaterThan(0)
        expect(r.error.bytes).toBeGreaterThanOrEqual(r.error.cap.bytes)
      }
    })

    it('duplicate CTE name — user already declared a CTE with our name', () => {
      const sql = 'WITH users AS (SELECT 1) SELECT * FROM @users, users'
      const r = resolveReferences(sql, parse(sql), {
        lookup: makeLookup([
          successTab('users', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('duplicate_cte_name')
    })
  })
})
