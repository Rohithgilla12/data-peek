import { describe, it, expect } from 'vitest'
import {
  buildFindIndex,
  findMatches as findInIndex,
  locateMatch,
  type FindQuery
} from '../grid-find'

const columns = [{ name: 'id' }, { name: 'email' }, { name: 'meta' }, { name: 'secret' }]

const rows: Record<string, unknown>[] = [
  { id: 1, email: 'Ada@example.com', meta: { plan: 'pro' }, secret: 'ada-token' },
  { id: 2, email: null, meta: null, secret: 'bob-token' },
  { id: 12, email: 'carol@EXAMPLE.com', meta: { plan: 'free' }, secret: 'carol-token' }
]

const notMasked = () => false

function findMatches(
  data: Record<string, unknown>[],
  cols: { name: string }[],
  q: FindQuery,
  isMasked: (name: string) => boolean
) {
  return findInIndex(buildFindIndex(data, cols, isMasked), q)
}
const query = (needle: string, overrides: Partial<FindQuery> = {}): FindQuery => ({
  needle,
  caseSensitive: false,
  regex: false,
  ...overrides
})

function matchesOf(result: ReturnType<typeof findMatches>) {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`)
  return result.matches
}

describe('findMatches', () => {
  it('returns no matches for an empty needle', () => {
    expect(findMatches(rows, columns, query(''), notMasked)).toEqual({ kind: 'ok', matches: [] })
  })

  it('ignores case by default and honours case sensitivity when asked', () => {
    expect(matchesOf(findMatches(rows, columns, query('example'), notMasked))).toEqual([
      { row: 0, col: 1 },
      { row: 2, col: 1 }
    ])
    expect(
      matchesOf(findMatches(rows, columns, query('EXAMPLE', { caseSensitive: true }), notMasked))
    ).toEqual([{ row: 2, col: 1 }])
  })

  it('reports matches in row-major order', () => {
    expect(matchesOf(findMatches(rows, columns, query('a'), notMasked))).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 }
    ])
  })

  it('matches objects through the same JSON text copy produces', () => {
    expect(matchesOf(findMatches(rows, columns, query('{"plan":"pro"}'), notMasked))).toEqual([
      { row: 0, col: 2 }
    ])
  })

  it('never matches null cells, even for a needle that "null" would contain', () => {
    expect(matchesOf(findMatches(rows, columns, query('null'), notMasked))).toEqual([])
  })

  it('skips masked columns', () => {
    const isMasked = (name: string) => name === 'secret'
    expect(matchesOf(findMatches(rows, columns, query('token'), isMasked))).toEqual([])
    expect(matchesOf(findMatches(rows, columns, query('token'), notMasked))).toHaveLength(3)
  })

  it('supports regular expressions, case-insensitive unless asked', () => {
    expect(
      matchesOf(findMatches(rows, columns, query('^1\\d$', { regex: true }), notMasked))
    ).toEqual([{ row: 2, col: 0 }])
    expect(
      matchesOf(findMatches(rows, columns, query('^ADA', { regex: true }), notMasked))
    ).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 3 }
    ])
    expect(
      matchesOf(
        findMatches(rows, columns, query('^ADA', { regex: true, caseSensitive: true }), notMasked)
      )
    ).toEqual([])
  })

  it('reuses one index across case-sensitive and case-insensitive queries', () => {
    const index = buildFindIndex(rows, columns, notMasked)
    expect(findInIndex(index, query('ADA', { caseSensitive: true }))).toEqual({
      kind: 'ok',
      matches: []
    })
    expect(findInIndex(index, query('ADA'))).toEqual({
      kind: 'ok',
      matches: [
        { row: 0, col: 1 },
        { row: 0, col: 3 }
      ]
    })
    expect(findInIndex(index, query('Ada', { caseSensitive: true }))).toEqual({
      kind: 'ok',
      matches: [{ row: 0, col: 1 }]
    })
  })

  it('gives the same answer on repeated calls with a regex', () => {
    const q = query('a', { regex: true })
    expect(findMatches(rows, columns, q, notMasked)).toEqual(
      findMatches(rows, columns, q, notMasked)
    )
  })

  it('reports an invalid regex instead of throwing', () => {
    const result = findMatches(rows, columns, query('(unclosed', { regex: true }), notMasked)
    expect(result.kind).toBe('invalid-regex')
    if (result.kind === 'invalid-regex') expect(result.message).toMatch(/unterminated|group/i)
  })

  it('indexes rows across the whole result, not one page', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ label: i === 120 ? 'needle' : 'hay' }))
    expect(matchesOf(findMatches(many, [{ name: 'label' }], query('needle'), notMasked))).toEqual([
      { row: 120, col: 0 }
    ])
  })
})

describe('locateMatch', () => {
  it('maps a whole-result row to its page and the row within that page', () => {
    expect(locateMatch({ row: 0, col: 2 }, 100)).toEqual({ pageIndex: 0, pos: { row: 0, col: 2 } })
    expect(locateMatch({ row: 99, col: 1 }, 100)).toEqual({
      pageIndex: 0,
      pos: { row: 99, col: 1 }
    })
    expect(locateMatch({ row: 100, col: 1 }, 100)).toEqual({
      pageIndex: 1,
      pos: { row: 0, col: 1 }
    })
    expect(locateMatch({ row: 251, col: 0 }, 25)).toEqual({
      pageIndex: 10,
      pos: { row: 1, col: 0 }
    })
  })
})
