import { describe, it, expect, vi } from 'vitest'
import {
  CAPABILITY_LABELS,
  CapabilityError,
  DB_CAPABILITIES,
  DB_TYPE_LABELS,
  SCHEMA_INTEL_CHECKS,
  hasCapability,
  supportsSchemaIntel,
  type Capability,
  type ConnectionConfig,
  type DatabaseType
} from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { getAdapterByType } from '../db-adapter'
import { requireCapability, unsupported } from '../lib/capability-guard'

const DB_TYPES = Object.keys(DB_CAPABILITIES) as DatabaseType[]
const CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[]

describe('DB_CAPABILITIES', () => {
  it('declares every capability for every database type', () => {
    for (const dbType of DB_TYPES) {
      expect(Object.keys(DB_CAPABILITIES[dbType]).sort()).toEqual([...CAPABILITIES].sort())
      expect(DB_TYPE_LABELS[dbType]).toBeTruthy()
    }
  })

  it.each(DB_TYPES)('%s agrees with the optional adapter methods', (dbType) => {
    const adapter = getAdapterByType(dbType)
    const row = DB_CAPABILITIES[dbType]
    expect(row.transactions).toBe(typeof adapter.beginTransaction === 'function')
    expect(row.stepThrough).toBe(typeof adapter.createDedicatedClient === 'function')
    expect(row.notifications).toBe(typeof adapter.createNotificationClient === 'function')
  })

  it('supportsSchemaIntel follows SCHEMA_INTEL_CHECKS', () => {
    for (const dbType of DB_TYPES) {
      const listed = SCHEMA_INTEL_CHECKS.some((c) => c.supportedDbTypes.includes(dbType))
      expect(supportsSchemaIntel(dbType)).toBe(listed)
    }
    expect(supportsSchemaIntel(undefined)).toBe(false)
  })

  it('hasCapability reads the table and treats no connection as nothing available', () => {
    expect(hasCapability('postgresql', 'transactions')).toBe(true)
    expect(hasCapability('sqlite', 'healthLocks')).toBe(false)
    expect(hasCapability(undefined, 'inlineEdit')).toBe(false)
  })
})

describe('requireCapability', () => {
  const config = (dbType: DatabaseType) => ({ dbType }) as ConnectionConfig

  it('passes silently when the cell is true', () => {
    expect(() => requireCapability(config('postgresql'), 'stepThrough')).not.toThrow()
  })

  it('throws the labelled message when the cell is false', () => {
    expect(() => requireCapability(config('sqlite'), 'healthLocks')).toThrow(
      'Lock monitoring is not available for SQLite connections.'
    )
    try {
      requireCapability(config('mysql'), 'transactions')
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityError)
      expect((error as CapabilityError).code).toBe('CAPABILITY_UNAVAILABLE')
      expect((error as CapabilityError).capability).toBe('transactions')
    }
  })

  it('defaults a missing dbType to postgresql', () => {
    expect(() => requireCapability({} as ConnectionConfig, 'pgDump')).not.toThrow()
  })

  it('adapter backstops produce the same message as the guard', () => {
    const fromGuard = (() => {
      try {
        requireCapability(config('sqlite'), 'killQuery')
      } catch (error) {
        return (error as Error).message
      }
      return ''
    })()
    expect(unsupported('sqlite', 'killQuery').message).toBe(fromGuard)
  })
})
