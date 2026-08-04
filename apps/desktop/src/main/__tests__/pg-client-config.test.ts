import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import type { ConnectionConfig } from '@shared/index'
import {
  buildClientConfig,
  buildSearchPathOption,
  parseSchemaList
} from '../adapters/pg-client-config'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn() }
})

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

describe('buildClientConfig SSL', () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReset()
  })

  it('leaves ssl unset when the connection does not use it', () => {
    expect(buildClientConfig(makeConfig()).ssl).toBeUndefined()
    expect(buildClientConfig(makeConfig({ ssl: false })).ssl).toBeUndefined()
  })

  it('asks pg to initiate TLS whenever "Use SSL" is on', () => {
    // A truthy ssl object is what makes pg send the SSLRequest — the equivalent of
    // sslmode=require. Without it the server answers "no pg_hba.conf entry ... no
    // encryption" (issue #252).
    expect(buildClientConfig(makeConfig({ ssl: true })).ssl).toEqual({
      rejectUnauthorized: false
    })
    expect(buildClientConfig(makeConfig({ ssl: true, sslOptions: {} })).ssl).toEqual({
      rejectUnauthorized: false
    })
  })

  it('only verifies the server certificate when strict mode is opted into', () => {
    expect(
      buildClientConfig(makeConfig({ ssl: true, sslOptions: { rejectUnauthorized: true } })).ssl
    ).toEqual({ rejectUnauthorized: true })
    expect(
      buildClientConfig(makeConfig({ ssl: true, sslOptions: { rejectUnauthorized: false } })).ssl
    ).toEqual({ rejectUnauthorized: false })
  })

  it('pins a supplied CA and verifies against it by default', () => {
    vi.mocked(readFileSync).mockReturnValue('---CA---')

    const config = buildClientConfig(makeConfig({ ssl: true, sslOptions: { ca: '/tmp/ca.pem' } }))

    expect(readFileSync).toHaveBeenCalledWith('/tmp/ca.pem', 'utf-8')
    expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: '---CA---' })
  })

  it('keeps a pinned CA while honouring an explicit opt-out of verification', () => {
    vi.mocked(readFileSync).mockReturnValue('---CA---')

    const config = buildClientConfig(
      makeConfig({ ssl: true, sslOptions: { ca: '/tmp/ca.pem', rejectUnauthorized: false } })
    )

    expect(config.ssl).toEqual({ rejectUnauthorized: false, ca: '---CA---' })
  })

  it('fails loudly rather than silently dropping TLS when the CA file is unreadable', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(() =>
      buildClientConfig(makeConfig({ ssl: true, sslOptions: { ca: '/nope.pem' } }))
    ).toThrow('Failed to read CA certificate file: /nope.pem')
  })
})
