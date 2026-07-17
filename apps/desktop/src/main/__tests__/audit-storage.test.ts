import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { AuditEntryInput } from '@shared/index'

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    transports: {
      console: { level: 'debug' },
      file: { level: 'debug', maxSize: 0, format: '' }
    },
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

import { AuditStorage } from '../audit-storage'

// better-sqlite3 is compiled for Electron's ABI; under plain node the whole
// suite skips (mirrors the vitest.config.ts exclusion of notebook-storage).
// Run for real via: ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run <file>
const sqliteAvailable = (() => {
  try {
    new Database(':memory:').close()
    return true
  } catch {
    return false
  }
})()

const ZERO = '0'.repeat(64)

function entry(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    source: 'editor',
    connectionId: 'c1',
    connectionName: 'local',
    dbType: 'postgresql',
    sql: 'SELECT 1',
    rowCount: 1,
    success: true,
    ...overrides
  }
}

describe.skipIf(!sqliteAvailable)('AuditStorage', () => {
  let dir: string
  let store: AuditStorage

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-test-'))
    store = new AuditStorage(join(dir, 'audit.db'))
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('records entries and chains hashes from the zero anchor', () => {
    store.record(entry())
    store.record(entry({ sql: 'SELECT 2' }))
    const rows = store.list({ limit: 10, offset: 0 })
    expect(rows).toHaveLength(2)
    expect(rows[0].prevHash).toBe(ZERO)
    expect(rows[1].prevHash).toBe(rows[0].hash)
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verify passes on an intact chain and an empty log', () => {
    expect(store.verify()).toEqual({ valid: true, entries: 0 })
    for (let i = 0; i < 5; i++) store.record(entry({ sql: `SELECT ${i}` }))
    expect(store.verify()).toEqual({ valid: true, entries: 5 })
  })

  it('verify detects tampering and reports the first broken entry', () => {
    for (let i = 0; i < 3; i++) store.record(entry({ sql: `SELECT ${i}` }))
    const second = store.list({ limit: 10, offset: 0 })[1]
    const raw = new Database(join(dir, 'audit.db'))
    raw.prepare('UPDATE audit_log SET sql = ? WHERE id = ?').run('DROP TABLE users', second.id)
    raw.close()
    const result = store.verify()
    expect(result.valid).toBe(false)
    expect(result.firstBrokenId).toBe(second.id)
  })

  it('verify detects tampering with connectionName', () => {
    for (let i = 0; i < 3; i++) store.record(entry({ sql: `SELECT ${i}` }))
    const second = store.list({ limit: 10, offset: 0 })[1]
    const raw = new Database(join(dir, 'audit.db'))
    raw.prepare('UPDATE audit_log SET connection_name = ? WHERE id = ?').run('renamed', second.id)
    raw.close()
    const result = store.verify()
    expect(result.valid).toBe(false)
    expect(result.firstBrokenId).toBe(second.id)
  })

  it('filters by source and connection', () => {
    store.record(entry())
    store.record(entry({ source: 'mcp', connectionId: 'c2' }))
    expect(store.list({ limit: 10, offset: 0, source: 'mcp' })).toHaveLength(1)
    expect(store.count({ connectionId: 'c2' })).toBe(1)
  })

  it('prune removes old entries and re-anchors so verify still passes', () => {
    for (let i = 0; i < 4; i++) store.record(entry({ sql: `SELECT ${i}` }))
    const all = store.list({ limit: 10, offset: 0 })
    const raw = new Database(join(dir, 'audit.db'))
    // Age the first two entries to 100 days old
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString()
    raw.prepare('UPDATE audit_log SET ts = ? WHERE id <= ?').run(old, all[1].id)
    raw.close()
    const removed = store.prune(90)
    expect(removed).toBe(2)
    expect(store.count({})).toBe(2)
    expect(store.verify()).toEqual({ valid: true, entries: 2 })
  })

  it('exports JSON and CSV with correct shapes', () => {
    store.record(entry({ sql: 'SELECT "quoted", comma' }))
    const jsonPath = join(dir, 'out.json')
    const csvPath = join(dir, 'out.csv')
    expect(store.exportTo('json', jsonPath).entries).toBe(1)
    expect(store.exportTo('csv', csvPath).entries).toBe(1)
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(parsed[0].sql).toBe('SELECT "quoted", comma')
    const csv = readFileSync(csvPath, 'utf-8')
    expect(csv.split('\n')[0]).toContain('ts,source,connectionId')
    expect(csv).toContain('"SELECT ""quoted"", comma"')
  })

  it('escapes CSV formula injection with a leading apostrophe', () => {
    store.record(entry({ sql: "=CMD('x')" }))
    const csvPath = join(dir, 'out.csv')
    store.exportTo('csv', csvPath)
    const csv = readFileSync(csvPath, 'utf-8')
    expect(csv).toMatch(/'=CMD\('x'\)/)
  })

  it('quotes CSV fields containing a bare carriage return', () => {
    store.record(entry({ sql: 'line1\rline2' }))
    const csvPath = join(dir, 'out.csv')
    store.exportTo('csv', csvPath)
    const csv = readFileSync(csvPath, 'utf-8')
    expect(csv).toContain('"line1\rline2"')
  })
})
