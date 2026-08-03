import { describe, it, expect } from 'vitest'
import { parseConnectionString } from '../connection-string-parser'

describe('parseConnectionString — default schema', () => {
  it('picks up Prisma-style ?schema=', () => {
    const parsed = parseConnectionString(
      'postgresql://u:p@host:5432/blocktree?schema=bbl',
      'postgresql'
    )
    expect(parsed?.schema).toBe('bbl')
    expect(parsed?.database).toBe('blocktree')
  })

  it('picks up ?search_path=, including a fallback chain', () => {
    expect(
      parseConnectionString('postgresql://u:p@host:5432/db?search_path=bbl,public', 'postgresql')
        ?.schema
    ).toBe('bbl,public')
  })

  it('picks up the libpq ?options=-c search_path= form', () => {
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3Dbbl',
        'postgresql'
      )?.schema
    ).toBe('bbl')
  })

  it('unwraps quotes and escapes from the libpq form so the field shows plain text', () => {
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3D%22bbl%22%2C%22public%22',
        'postgresql'
      )?.schema
    ).toBe('bbl,public')
  })

  it('keeps a backslash-escaped space in the libpq form instead of truncating at it', () => {
    // The server splits `options` on unescaped whitespace only, so `\ ` is part of the
    // value. A naive \S+ would capture just `"my\` and silently drop `,"public"`.
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3D%22my%5C%20schema%22%2C%22public%22',
        'postgresql'
      )?.schema
    ).toBe('my schema,public')
  })

  it('preserves a doubled quote as one literal quote in the schema name', () => {
    // `"we""ird"` is the identifier we"ird. Stripping every quote in one pass would
    // yield `weird` and point search_path at a different schema entirely.
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3D%22we%22%22ird%22%2C%22public%22',
        'postgresql'
      )?.schema
    ).toBe('we"ird,public')
  })

  it('handles a name carrying both an escaped space and a doubled quote', () => {
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3D%22my%5C%20%22%22quoted%22%22%5C%20schema%22',
        'postgresql'
      )?.schema
    ).toBe('my "quoted" schema')
  })

  it('stops at the next unescaped option rather than swallowing it', () => {
    expect(
      parseConnectionString(
        'postgresql://u:p@host:5432/db?options=-c%20search_path%3Dbbl%20-c%20statement_timeout%3D5s',
        'postgresql'
      )?.schema
    ).toBe('bbl')
  })

  it('leaves schema undefined when the URL does not specify one', () => {
    expect(
      parseConnectionString('postgresql://u:p@host:5432/db', 'postgresql')?.schema
    ).toBeUndefined()
  })

  it('ignores a blank schema param rather than pinning an empty search_path', () => {
    expect(
      parseConnectionString('postgresql://u:p@host:5432/db?schema=', 'postgresql')?.schema
    ).toBeUndefined()
  })

  it('ignores ?schema= for MySQL, where schema and database are the same thing', () => {
    const parsed = parseConnectionString('mysql://u:p@host:3306/appdb?schema=other', 'mysql')
    expect(parsed?.database).toBe('appdb')
    expect(parsed?.schema).toBeUndefined()
  })

  it('still parses the rest of the URL alongside the schema', () => {
    const parsed = parseConnectionString(
      'postgresql://svc:pw@db.example.com/blocktree?schema=bbl&sslmode=no-verify',
      'postgresql'
    )
    expect(parsed).toMatchObject({
      host: 'db.example.com',
      port: '5432',
      database: 'blocktree',
      user: 'svc',
      password: 'pw',
      ssl: true,
      schema: 'bbl'
    })
  })
})
