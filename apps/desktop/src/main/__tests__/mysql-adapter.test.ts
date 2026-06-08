import { describe, it, expect, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

// The adapter reaches electron via lib/logger (through query-tracker) and pulls in
// ssh2 via ssh-tunnel-service; neither is needed to exercise the pure helpers.
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => 'CA_CERT_CONTENT') }
})

import {
  resolveMySQLType,
  normalizeRow,
  isDataReturningStatement,
  toMySQLConfig
} from '../adapters/mysql-adapter'

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'm1',
    name: 'test-mysql',
    host: 'db.example.com',
    port: 3306,
    database: 'app',
    user: 'u',
    password: 'p',
    dbType: 'mysql',
    dstPort: 3306,
    ...overrides
  }
}

describe('resolveMySQLType', () => {
  it('maps known type codes to names', () => {
    expect(resolveMySQLType(254)).toBe('string')
    expect(resolveMySQLType(255)).toBe('geometry')
  })

  it('falls back to unknown(code) for unmapped codes', () => {
    expect(resolveMySQLType(9999)).toBe('unknown(9999)')
  })
})

describe('normalizeRow', () => {
  it('lowercases every key', () => {
    expect(normalizeRow({ ID: 1, Name: 'x', EMAIL: 'a@b' })).toEqual({
      id: 1,
      name: 'x',
      email: 'a@b'
    })
  })

  it('preserves values including null and 0', () => {
    expect(normalizeRow({ A: null, B: 0 })).toEqual({ a: null, b: 0 })
  })
})

describe('isDataReturningStatement (mysql)', () => {
  it.each([
    ['SELECT * FROM t', true],
    ['  select 1', true],
    ['SHOW TABLES', true],
    ['DESCRIBE t', true],
    ['DESC t', true],
    ['EXPLAIN SELECT 1', true],
    ['INSERT INTO t VALUES (1) RETURNING id', true],
    ['INSERT INTO t VALUES (1)', false],
    ['UPDATE t SET a = 1', false],
    ['DELETE FROM t', false]
  ])('%s -> %s', (sql, expected) => {
    expect(isDataReturningStatement(sql)).toBe(expected)
  })
})

describe('toMySQLConfig', () => {
  it('maps basic fields and applies tunnel host/port overrides', () => {
    const cfg = toMySQLConfig(makeConfig(), { host: '127.0.0.1', port: 13306 })
    expect(cfg).toMatchObject({
      host: '127.0.0.1',
      port: 13306,
      user: 'u',
      password: 'p',
      database: 'app'
    })
    expect(cfg.ssl).toBeUndefined()
  })

  it('without ssl sets no ssl options', () => {
    const cfg = toMySQLConfig(makeConfig({ ssl: false }))
    expect(cfg.host).toBe('db.example.com')
    expect(cfg.ssl).toBeUndefined()
  })

  it('ssl without a CA defaults rejectUnauthorized to false (cloud-friendly)', () => {
    const cfg = toMySQLConfig(makeConfig({ ssl: true }))
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('ssl with rejectUnauthorized:true opts into strict verification', () => {
    const cfg = toMySQLConfig(makeConfig({ ssl: true, sslOptions: { rejectUnauthorized: true } }))
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true })
  })

  it('ssl with a CA path reads the cert and defaults rejectUnauthorized to true', () => {
    const cfg = toMySQLConfig(makeConfig({ ssl: true, sslOptions: { ca: '/certs/rds-ca.pem' } }))
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true, ca: 'CA_CERT_CONTENT' })
  })
})
