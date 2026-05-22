import { describe, it, expect } from 'vitest'
import { resolveReferences, type ResolvableTab } from '../cross-tab-resolver'
import { parseTabReferences } from '../cross-tab-parser'

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

const makeLookup = (tabs: ResolvableTab[]) =>
  (name: string) => tabs.find((t) => t.name === name) ?? null

describe('resolveReferences', () => {
  describe('happy paths', () => {
    it('no references → source unchanged', () => {
      const sql = 'SELECT * FROM users'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      // Identifier substitution removed the @
      expect(r.result.finalSql).toContain('SELECT * FROM active_users')
      expect(r.result.finalSql).not.toContain('@active_users')
      expect(r.result.rowsInlined).toBe(2)
    })

    it('emits PG type casts on the first VALUES tuple', () => {
      const sql = 'SELECT * FROM @t'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      // First tuple should carry ::integer and ::text casts.
      expect(r.result.prependedCtes[0]).toMatch(/::integer/)
      expect(r.result.prependedCtes[0]).toMatch(/::text/)
    })

    it('multiple distinct references → multiple CTEs in alphabetical order', () => {
      const sql = 'SELECT * FROM @users JOIN @orders USING(user_id)'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      // Alphabetical: orders before users.
      const ordersIdx = r.result.finalSql.indexOf('orders(')
      const usersIdx = r.result.finalSql.indexOf('users(')
      expect(ordersIdx).toBeGreaterThan(0)
      expect(ordersIdx).toBeLessThan(usersIdx)
    })

    it('repeated references emit only one CTE', () => {
      const sql = 'SELECT * FROM @t a JOIN @t b ON a.id < b.id'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([
          successTab('t', [{ id: 1 }, { id: 2 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes).toHaveLength(1)
      // Both references substituted in the final SQL.
      expect(r.result.finalSql.indexOf('t a')).toBeGreaterThan(0)
      expect(r.result.finalSql.indexOf('t b')).toBeGreaterThan(0)
    })

    it('empty result emits a defensible WHERE FALSE CTE', () => {
      const sql = 'SELECT * FROM @empty'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([
          successTab('empty', [], [{ name: 'id', dataType: 'integer' }])
        ]),
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
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([
          successTab('users', [{ id: 1 }], [{ name: 'id', dataType: 'integer' }])
        ]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // The merged WITH should appear once at the start; users CTE comes
      // before the user's `high` CTE.
      const final = r.result.finalSql
      expect(final.indexOf('WITH')).toBe(0)
      expect(final.indexOf('users(')).toBeLessThan(final.indexOf('high AS'))
    })
  })

  describe('errors', () => {
    it('unknown reference', () => {
      const sql = 'SELECT * FROM @xyz'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: () => null,
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('unknown_reference')
    })

    it('referenced tab has no result yet', () => {
      const sql = 'SELECT * FROM @pending'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([errorTab('broken', 'syntax error at or near "frm"')]),
        currentTabId: 'main',
        dialect: 'postgresql'
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('errored_result')
      if (r.error.kind === 'errored_result') {
        expect(r.error.error).toContain('syntax error')
      }
    })

    it('self-reference flagged as circular', () => {
      const sql = 'SELECT * FROM @me'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
    })

    it('row cap exceeded', () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({ id: i }))
      const sql = 'SELECT * FROM @big'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
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
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([successTab('wide', rows, fields)]),
        currentTabId: 'main',
        dialect: 'postgresql',
        caps: { maxColumnsPerRef: 3 }
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('too_many_columns')
    })

    it('byte cap exceeded', () => {
      // Use a tiny cap so even a small inlined value blows past it.
      const sql = 'SELECT * FROM @t'
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([
          successTab(
            't',
            [{ note: 'x'.repeat(100) }],
            [{ name: 'note', dataType: 'text' }]
          )
        ]),
        currentTabId: 'main',
        dialect: 'postgresql',
        caps: { maxBytesTotal: 10 }
      })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.kind).toBe('too_large')
    })
  })

  describe('dialect handling', () => {
    it('mysql identifier quoting uses backticks', () => {
      const sql = 'SELECT * FROM @select_data'
      // `select_data` doesn't need quoting, but if a field name needs it
      // we want backticks for mysql. Use a column named 'order' which is a
      // reserved word.
      const parsed = parseTabReferences(sql)
      const r = resolveReferences(sql, parsed, {
        lookup: makeLookup([
          successTab(
            'select_data',
            [{ order: 1 }],
            [{ name: 'order', dataType: 'integer' }]
          )
        ]),
        currentTabId: 'main',
        dialect: 'mysql'
      })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.result.prependedCtes[0]).toContain('`order`')
    })
  })
})
