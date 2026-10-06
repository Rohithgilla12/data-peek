import { describe, it, expect } from 'vitest'
import { AGG_SEPARATOR, commentedSql, parseAggList } from '@shared/schema-intel/sql-safety'

describe('commentedSql', () => {
  it('prefixes every line with a line comment', () => {
    expect(commentedSql(['one', 'two'])).toBe('-- one\n-- two')
  })

  it('leaves the payload unchanged when nothing needs escaping', () => {
    // The shape every dialect's tables_without_pk suggestion had before.
    expect(
      commentedSql(['Review and pick a unique column before running:', 'ALTER TABLE t;'])
    ).toBe('-- Review and pick a unique column before running:\n-- ALTER TABLE t;')
  })

  it('cannot be escaped by a line break in an interpolated identifier', () => {
    const table = 'audit\nDROP TABLE users;--'
    const out = commentedSql([`ALTER TABLE ${table} ADD id INT;`])
    const lines = out.split('\n')

    // Every physical line is a comment, so the injected statement stays inert.
    expect(lines.every((line) => line.startsWith('-- '))).toBe(true)
    expect(lines).toHaveLength(2)
  })

  it('handles CRLF and a bare CR as line breaks', () => {
    expect(commentedSql(['a\r\nb\rc'])).toBe('-- a\n-- b\n-- c')
  })

  it('cannot be escaped by a quote or a bracket in an identifier', () => {
    // Quoting does not help: `"a\nb"`, `[a\nb]` and `` `a\nb` `` all still end the comment.
    const out = commentedSql(['ALTER TABLE "a\nb";'])
    expect(out.split('\n').every((line) => line.startsWith('-- '))).toBe(true)
  })
})

describe('parseAggList', () => {
  it('splits on the separator rather than on a comma', () => {
    expect(parseAggList(`a${AGG_SEPARATOR}b`)).toEqual(['a', 'b'])
  })

  it('keeps a comma inside a name intact', () => {
    // A comma-joined payload used to turn this one column into two.
    expect(parseAggList(`region,code${AGG_SEPARATOR}id`)).toEqual(['region,code', 'id'])
  })

  it('keeps an empty entry only when asked', () => {
    // `fk_columns` uses '' as a positional placeholder, so it must survive.
    const payload = `a${AGG_SEPARATOR}${AGG_SEPARATOR}b`
    expect(parseAggList(payload)).toEqual(['a', 'b'])
    expect(parseAggList(payload, true)).toEqual(['a', '', 'b'])
  })

  it('is tolerant of NULL, undefined and empty payloads', () => {
    expect(parseAggList(null)).toEqual([])
    expect(parseAggList(undefined)).toEqual([])
    expect(parseAggList('')).toEqual([])
  })

  it('does not split a name that contains a comma alone', () => {
    // Guards the regression directly: no separator means one entry.
    expect(parseAggList('a,b')).toEqual(['a,b'])
  })
})
