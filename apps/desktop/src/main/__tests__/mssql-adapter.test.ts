import { describe, it, expect, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))

import {
  resolveMSSQLType,
  inferTypeFromValue,
  isDataReturningStatement,
  toMSSQLConfig
} from '../adapters/mssql-adapter'

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 's1',
    name: 'test-mssql',
    host: 'db.example.com',
    port: 1433,
    database: 'app',
    user: 'u',
    password: 'p',
    dbType: 'mssql',
    dstPort: 1433,
    ...overrides
  }
}

describe('resolveMSSQLType', () => {
  it('falls back to unknown(id) for unmapped type ids', () => {
    expect(resolveMSSQLType(-1)).toBe('unknown(-1)')
  })
})

describe('inferTypeFromValue', () => {
  it('null/undefined infer nvarchar', () => {
    expect(inferTypeFromValue(null)).toEqual({ dataType: 'nvarchar', dataTypeID: 231 })
    expect(inferTypeFromValue(undefined)).toEqual({ dataType: 'nvarchar', dataTypeID: 231 })
  })

  it('distinguishes integer from float', () => {
    expect(inferTypeFromValue(5)).toEqual({ dataType: 'int', dataTypeID: 56 })
    expect(inferTypeFromValue(5.5)).toEqual({ dataType: 'float', dataTypeID: 62 })
  })

  it('maps boolean to bit, Date to datetime, objects to nvarchar', () => {
    expect(inferTypeFromValue(true)).toEqual({ dataType: 'bit', dataTypeID: 104 })
    expect(inferTypeFromValue(new Date())).toEqual({ dataType: 'datetime', dataTypeID: 61 })
    expect(inferTypeFromValue({ a: 1 })).toEqual({ dataType: 'nvarchar', dataTypeID: 231 })
  })
})

describe('isDataReturningStatement (mssql)', () => {
  it.each([
    ['SELECT 1', true],
    ['WITH cte AS (SELECT 1) SELECT * FROM cte', true],
    ['EXEC sp_who', true],
    ['EXECUTE sp_who', true],
    ['EXECUTE AS CALLER', false],
    ['INSERT INTO t OUTPUT inserted.id VALUES (1)', true],
    ['INSERT INTO t VALUES (1)', false],
    ['UPDATE t SET a = 1', false]
  ])('%s -> %s', (sql, expected) => {
    expect(isDataReturningStatement(sql)).toBe(expected)
  })
})

describe('toMSSQLConfig', () => {
  it('SQL auth maps server/port/database and credentials', () => {
    const cfg = toMSSQLConfig(makeConfig())
    expect(cfg.server).toBe('db.example.com')
    expect(cfg.port).toBe(1433)
    expect(cfg.database).toBe('app')
    expect(cfg.user).toBe('u')
    expect(cfg.password).toBe('p')
  })

  it('applies tunnel host/port overrides', () => {
    const cfg = toMSSQLConfig(makeConfig(), { host: '127.0.0.1', port: 14333 })
    expect(cfg.server).toBe('127.0.0.1')
    expect(cfg.port).toBe(14333)
  })

  it('Azure AD Integrated sets azure auth and omits user/password', () => {
    const cfg = toMSSQLConfig(
      makeConfig({ mssqlOptions: { authentication: 'ActiveDirectoryIntegrated' } })
    )
    expect(cfg.authentication).toEqual({ type: 'azure-active-directory-default', options: {} })
    expect(cfg.user).toBeUndefined()
    expect(cfg.password).toBeUndefined()
    // trustServerCertificate is intentionally not set for Azure AD
    expect(cfg.options?.trustServerCertificate).toBeUndefined()
  })

  it('without ssl defaults trustServerCertificate to true', () => {
    const cfg = toMSSQLConfig(makeConfig({ ssl: false }))
    expect(cfg.options?.trustServerCertificate).toBe(true)
  })

  it('with ssl enables encrypt', () => {
    const cfg = toMSSQLConfig(makeConfig({ ssl: true }))
    expect(cfg.options?.encrypt).toBe(true)
  })

  it('defaults requestTimeout to 0 (no timeout) for long-running queries', () => {
    const cfg = toMSSQLConfig(makeConfig())
    expect(cfg.options?.requestTimeout).toBe(0)
  })
})
