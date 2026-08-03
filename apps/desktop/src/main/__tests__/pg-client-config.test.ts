import { describe, it, expect } from 'vitest'
import type { ConnectionConfig } from '@shared/index'
import {
  buildClientConfig,
  buildSearchPathOption,
  parseSchemaList
} from '../adapters/pg-client-config'

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'cfg-1',
    name: 'test',
    host: 'localhost',
    port: 5432,
    database: 'db',
    user: 'u',
    password: 'p',
    dbType: 'postgresql',
    dstPort: 5432,
    ...overrides
  }
}

describe('parseSchemaList', () => {
  it('returns an empty list for absent or blank values', () => {
    expect(parseSchemaList(undefined)).toEqual([])
    expect(parseSchemaList('')).toEqual([])
    expect(parseSchemaList('   ')).toEqual([])
    expect(parseSchemaList(' , , ')).toEqual([])
  })

  it('splits and trims a comma-separated fallback chain', () => {
    expect(parseSchemaList('bbl, public')).toEqual(['bbl', 'public'])
    expect(parseSchemaList('  bbl  ')).toEqual(['bbl'])
  })

  it('unwraps a value pasted straight out of SHOW search_path', () => {
    expect(parseSchemaList('"bbl","public"')).toEqual(['bbl', 'public'])
    expect(parseSchemaList('"blocktree"')).toEqual(['blocktree'])
  })

  it('re-quotes an unwrapped paste rather than nesting the quotes', () => {
    expect(buildSearchPathOption('"bbl","public"')).toBe('-c search_path="bbl","public"')
  })
})

describe('buildSearchPathOption', () => {
  it('leaves the server default in place when no schema is configured', () => {
    expect(buildSearchPathOption(undefined)).toBeUndefined()
    expect(buildSearchPathOption('')).toBeUndefined()
    expect(buildSearchPathOption('  ')).toBeUndefined()
  })

  it('double-quotes the schema so mixed case and reserved words survive', () => {
    expect(buildSearchPathOption('bbl')).toBe('-c search_path="bbl"')
    expect(buildSearchPathOption('MySchema')).toBe('-c search_path="MySchema"')
    expect(buildSearchPathOption('user')).toBe('-c search_path="user"')
  })

  it('emits a comma-separated chain for multiple schemas', () => {
    expect(buildSearchPathOption('bbl, public')).toBe('-c search_path="bbl","public"')
  })

  it('backslash-escapes whitespace, which pg_split_opts would otherwise treat as an argument break', () => {
    // The server strips the backslashes before the GUC parser sees the value, so this
    // arrives as search_path="we ird","public".
    expect(buildSearchPathOption('we ird, public')).toBe('-c search_path="we\\ ird","public"')
  })

  it('escapes backslashes in the schema name so they are not eaten as escapes', () => {
    expect(buildSearchPathOption('we\\ird')).toBe('-c search_path="we\\\\ird"')
  })

  it('doubles embedded quotes so the identifier cannot be terminated early', () => {
    expect(buildSearchPathOption('we"ird')).toBe('-c search_path="we""ird"')
  })
})

describe('buildClientConfig', () => {
  it('sets startup options when a default schema is configured', () => {
    expect(buildClientConfig(makeConfig({ schema: 'bbl' })).options).toBe('-c search_path="bbl"')
  })

  it('omits options entirely when no schema is configured', () => {
    expect(buildClientConfig(makeConfig()).options).toBeUndefined()
    expect(buildClientConfig(makeConfig({ schema: '' })).options).toBeUndefined()
  })

  it('keeps the search_path when the connection is tunnelled through SSH', () => {
    const config = buildClientConfig(makeConfig({ schema: 'bbl' }), {
      host: '127.0.0.1',
      port: 54320
    })
    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(54320)
    expect(config.options).toBe('-c search_path="bbl"')
  })
})
