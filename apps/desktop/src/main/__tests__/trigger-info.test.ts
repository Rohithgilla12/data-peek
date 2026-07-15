import { describe, it, expect, vi } from 'vitest'
import type { TriggerInfo, SchemaInfo } from '@shared/index'

// The adapter transitively imports the Electron-backed logger; stub it out so the
// module can be imported in a plain Node/vitest environment.
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))

import { parsePostgresTriggerType } from '../adapters/postgres-adapter'

describe('TriggerInfo Type', () => {
  it('describes a simple AFTER INSERT row trigger', () => {
    const trigger: TriggerInfo = {
      name: 'audit_users',
      schema: 'public',
      table: 'users',
      timing: 'AFTER',
      events: ['INSERT'],
      orientation: 'ROW',
      enabled: true,
      functionName: 'public.log_audit',
      definition: 'CREATE TRIGGER audit_users AFTER INSERT ON users ...'
    }
    expect(trigger.timing).toBe('AFTER')
    expect(trigger.events).toContain('INSERT')
    expect(trigger.enabled).toBe(true)
  })

  it('allows disabled triggers and multiple events', () => {
    const trigger: TriggerInfo = {
      name: 'sync_cache',
      schema: 'public',
      table: 'orders',
      timing: 'BEFORE',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      enabled: false,
      definition: 'CREATE TRIGGER sync_cache ...'
    }
    expect(trigger.enabled).toBe(false)
    expect(trigger.events).toHaveLength(3)
  })

  it('attaches to a schema via the optional triggers array', () => {
    const schema: SchemaInfo = {
      name: 'public',
      tables: [],
      routines: [],
      triggers: [
        {
          name: 't1',
          schema: 'public',
          table: 'users',
          timing: 'AFTER',
          events: ['UPDATE'],
          enabled: true,
          definition: 'CREATE TRIGGER t1 ...'
        }
      ]
    }
    expect(schema.triggers).toHaveLength(1)
  })
})

describe('parsePostgresTriggerType (tgtype bitmask)', () => {
  // Bit layout: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32, INSTEAD=64
  it('decodes an AFTER INSERT row-level trigger', () => {
    // ROW (1) + INSERT (4) = 5, no BEFORE bit -> AFTER
    expect(parsePostgresTriggerType(5)).toEqual({
      timing: 'AFTER',
      events: ['INSERT'],
      orientation: 'ROW'
    })
  })

  it('decodes a BEFORE UPDATE/DELETE row-level trigger', () => {
    // ROW (1) + BEFORE (2) + DELETE (8) + UPDATE (16) = 27
    expect(parsePostgresTriggerType(27)).toEqual({
      timing: 'BEFORE',
      events: ['UPDATE', 'DELETE'],
      orientation: 'ROW'
    })
  })

  it('decodes a statement-level AFTER TRUNCATE trigger', () => {
    // TRUNCATE (32), no ROW bit -> STATEMENT, no BEFORE -> AFTER
    expect(parsePostgresTriggerType(32)).toEqual({
      timing: 'AFTER',
      events: ['TRUNCATE'],
      orientation: 'STATEMENT'
    })
  })

  it('decodes an INSTEAD OF INSERT trigger on a view', () => {
    // ROW (1) + INSERT (4) + INSTEAD (64) = 69
    expect(parsePostgresTriggerType(69)).toEqual({
      timing: 'INSTEAD OF',
      events: ['INSERT'],
      orientation: 'ROW'
    })
  })
})
