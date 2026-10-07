import { describe, it, expect } from 'vitest'
import { buildQualifiedTableRef, buildSelectQuery, quoteIdentifier } from '@/lib/sql-helpers'
import { formatSQL, formatterLanguage } from '@/lib/sql-formatter'

describe('sql-helpers for ClickHouse', () => {
  it('quotes identifiers with backticks and escapes embedded backticks', () => {
    expect(quoteIdentifier('odd-names', 'clickhouse')).toBe('`odd-names`')
    expect(quoteIdentifier('a`b', 'clickhouse')).toBe('`a``b`')
    expect(quoteIdentifier('`already`', 'clickhouse')).toBe('`already`')
  })

  it('omits the default database but keeps every other one', () => {
    expect(buildQualifiedTableRef('default', 'events', 'clickhouse')).toBe('`events`')
    expect(buildQualifiedTableRef('acme_analytics', 'odd-names', 'clickhouse')).toBe(
      '`acme_analytics`.`odd-names`'
    )
    expect(buildQualifiedTableRef('public', 'events', 'clickhouse')).toBe('`public`.`events`')
  })

  it('builds LIMIT/OFFSET pagination', () => {
    expect(
      buildSelectQuery('`acme_analytics`.`events`', 'clickhouse', { limit: 50, offset: 100 })
    ).toBe('SELECT * FROM `acme_analytics`.`events` LIMIT 50 OFFSET 100;')
  })
})

describe('formatter dialect', () => {
  it('picks the clickhouse dialect only for ClickHouse connections', () => {
    expect(formatterLanguage('clickhouse')).toBe('clickhouse')
    expect(formatterLanguage('postgresql')).toBe('postgresql')
    expect(formatterLanguage(undefined)).toBe('postgresql')
  })

  it('formats backtick identifiers under the clickhouse dialect instead of giving up', () => {
    const sql = 'select `order`, `has space` from acme_analytics.`odd-names` limit 10'
    const formatted = formatSQL(sql, { language: 'clickhouse' })
    expect(formatted).not.toBe(sql)
    expect(formatted).toContain('SELECT')
    expect(formatted).toContain('`has space`')
  })
})
