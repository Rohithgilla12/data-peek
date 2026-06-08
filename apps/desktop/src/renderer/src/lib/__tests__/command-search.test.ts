import { describe, it, expect } from 'vitest'
import { fuzzyFilter, calculateFuzzyScore, getQueryType } from '@/lib/command-search'

describe('getQueryType', () => {
  it.each([
    ['SELECT * FROM t', 'SELECT'],
    ['  insert into t values (1)', 'INSERT'],
    ['UPDATE t SET a = 1', 'UPDATE'],
    ['DELETE FROM t', 'DELETE'],
    ['CREATE TABLE t (id int)', 'CREATE'],
    ['ALTER TABLE t ADD c int', 'ALTER'],
    ['DROP TABLE t', 'DROP'],
    ['EXPLAIN SELECT 1', 'EXPLAIN'],
    ['BEGIN', 'SQL'],
    ['', 'SQL']
  ])('%s -> %s', (sql, expected) => {
    expect(getQueryType(sql)).toBe(expected)
  })
})

describe('fuzzyFilter', () => {
  it('returns 1 for empty search (everything matches)', () => {
    expect(fuzzyFilter('Anything', '')).toBe(1)
  })

  it('returns 1 for an exact case-insensitive match', () => {
    expect(fuzzyFilter('New Query Tab', 'new query tab')).toBe(1)
  })

  it('returns 0.95 for a prefix match', () => {
    expect(fuzzyFilter('New Query Tab', 'new')).toBe(0.95)
  })

  it('scores an acronym match (nqt -> New Query Tab) at 0.9', () => {
    expect(fuzzyFilter('New Query Tab', 'nqt')).toBe(0.9)
  })

  it('scores a substring match at 0.8', () => {
    expect(fuzzyFilter('New Query Tab', 'query')).toBe(0.8)
  })

  it('returns 0 when nothing matches', () => {
    expect(fuzzyFilter('New Query Tab', 'zzz')).toBe(0)
  })

  it('ranks exact > prefix > acronym > substring', () => {
    const exact = fuzzyFilter('New Query Tab', 'new query tab')
    const prefix = fuzzyFilter('New Query Tab', 'new')
    const acronym = fuzzyFilter('New Query Tab', 'nqt')
    const substring = fuzzyFilter('New Query Tab', 'query')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(acronym)
    expect(acronym).toBeGreaterThan(substring)
  })
})

describe('calculateFuzzyScore', () => {
  it('returns 0 unless every search char is present in order', () => {
    expect(calculateFuzzyScore('abc', 'xyz')).toBe(0)
    expect(calculateFuzzyScore('abc', 'acb')).toBe(0)
  })

  it('returns a positive score when all chars match in order', () => {
    expect(calculateFuzzyScore('feedback', 'feed')).toBeGreaterThan(0)
  })

  it('never exceeds the 0.7 cap', () => {
    expect(calculateFuzzyScore('feedback', 'feedback')).toBeLessThanOrEqual(0.7)
  })
})
