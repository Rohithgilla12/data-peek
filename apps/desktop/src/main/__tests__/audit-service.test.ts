import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() })
}))

import {
  initAuditService,
  recordAudit,
  getAuditStatus,
  setAuditEnabled,
  setAuditRetention,
  AUDIT_SETTINGS_DEFAULTS
} from '../audit-service'

function makeStore(initial = { ...AUDIT_SETTINGS_DEFAULTS }) {
  let value = { ...initial }
  return {
    get: vi.fn(() => value),
    set: vi.fn((_k: string, v: typeof value) => {
      value = v
    })
  } as never
}

function makeStorage() {
  return {
    record: vi.fn(),
    count: vi.fn(() => 0),
    prune: vi.fn(() => 0),
    verify: vi.fn(),
    list: vi.fn(),
    exportTo: vi.fn(),
    close: vi.fn()
  } as never
}

describe('audit-service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recordAudit is a no-op while disabled', () => {
    const storage = makeStorage()
    initAuditService(makeStore(), storage)
    recordAudit({
      source: 'editor',
      connectionId: 'c1',
      connectionName: 'x',
      dbType: 'postgresql',
      sql: 'SELECT 1',
      rowCount: 1,
      success: true
    })
    expect((storage as { record: ReturnType<typeof vi.fn> }).record).not.toHaveBeenCalled()
  })

  it('records after enabling, and never throws when storage.record throws', () => {
    const storage = makeStorage()
    ;(storage as { record: ReturnType<typeof vi.fn> }).record.mockImplementation(() => {
      throw new Error('disk full')
    })
    initAuditService(makeStore(), storage)
    setAuditEnabled(true)
    expect(() =>
      recordAudit({
        source: 'mcp',
        connectionId: 'c1',
        connectionName: 'x',
        dbType: 'postgresql',
        sql: 'SELECT 1',
        rowCount: null,
        success: false,
        error: 'boom'
      })
    ).not.toThrow()
    expect((storage as { record: ReturnType<typeof vi.fn> }).record).toHaveBeenCalledOnce()
  })

  it('reports unavailable when storage is null and setEnabled still persists', () => {
    initAuditService(makeStore(), null)
    expect(getAuditStatus().available).toBe(false)
    const status = setAuditEnabled(true)
    expect(status.enabled).toBe(true)
  })

  it('validates retention bounds', () => {
    initAuditService(makeStore(), makeStorage())
    expect(() => setAuditRetention(3)).toThrow(/between 7 and 3650/)
    expect(setAuditRetention(30).retentionDays).toBe(30)
  })
})
