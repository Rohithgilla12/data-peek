import { describe, expect, it } from 'vitest'
import { formatterLanguage, formatSQL, isValidSQL } from '../sql-formatter'

describe('sql-formatter', () => {
  it('correctly maps all 5 database types to supported sql-formatter dialects', () => {
    expect(formatterLanguage('postgresql')).toBe('postgresql')
    expect(formatterLanguage('mysql')).toBe('mysql')
    expect(formatterLanguage('sqlite')).toBe('sqlite')
    expect(formatterLanguage('mssql')).toBe('transactsql')
    expect(formatterLanguage('clickhouse')).toBe('clickhouse')
    expect(formatterLanguage(undefined)).toBe('postgresql')
  })

  it('formats SQL with appropriate dialect rules', () => {
    const pgSql = 'select id, name from "users" where id = 1;'
    const formattedPg = formatSQL(pgSql, { language: 'postgresql' })
    expect(formattedPg).toContain('SELECT')
    expect(formattedPg).toContain('FROM')

    const mssqlSql = 'select id, name from [dbo].[users] where id = 1;'
    const formattedMssql = formatSQL(mssqlSql, { language: 'transactsql' })
    expect(formattedMssql).toContain('SELECT')
    expect(formattedMssql).toContain('[dbo].[users]')

    const mysqlSql = 'select id, name from `users` where id = 1;'
    const formattedMysql = formatSQL(mysqlSql, { language: 'mysql' })
    expect(formattedMysql).toContain('SELECT')
    expect(formattedMysql).toContain('`users`')
  })

  it('validates SQL statements', () => {
    expect(isValidSQL('SELECT 1')).toBe(true)
    expect(isValidSQL('INSERT INTO users VALUES (1)')).toBe(true)
    expect(isValidSQL('-- just a comment')).toBe(true)
    expect(isValidSQL('')).toBe(false)
    expect(isValidSQL('hello world')).toBe(false)
  })
})
