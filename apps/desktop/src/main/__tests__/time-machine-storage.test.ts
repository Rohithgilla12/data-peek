import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import Database from 'better-sqlite3'
import type { TimeMachineCapturePayload } from '@shared/index'
import { TM_MAX_RUNS_PER_QUERY } from '@shared/index'

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

import { TimeMachineStorage } from '../time-machine-storage'

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

function payload(overrides: Partial<TimeMachineCapturePayload> = {}): TimeMachineCapturePayload {
  return {
    connectionId: 'conn-1',
    sql: 'SELECT * FROM users WHERE id = 1',
    capturedAt: 1000,
    durationMs: 12,
    rowCount: 2,
    truncated: false,
    keyStrategy: 'primary_key',
    keyColumns: ['id'],
    columns: [
      { name: 'id', dataType: 'integer' },
      { name: 'name', dataType: 'text' }
    ],
    rows: [
      [1, 'Alice'],
      [2, 'Bob']
    ],
    ...overrides
  }
}

describe.skipIf(!sqliteAvailable)('TimeMachineStorage', () => {
  let storage: TimeMachineStorage
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-machine-storage-test-'))
    storage = new TimeMachineStorage(tmpDir)
  })

  afterEach(() => {
    storage.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('insertRun and listRuns', () => {
    it('returns the inserted run meta', () => {
      const meta = storage.insertRun(payload(), 'fp-1')

      expect(meta.id).toBeDefined()
      expect(meta.connectionId).toBe('conn-1')
      expect(meta.fingerprint).toBe('fp-1')
      expect(meta.sql).toBe('SELECT * FROM users WHERE id = 1')
      expect(meta.capturedAt).toBe(1000)
      expect(meta.durationMs).toBe(12)
      expect(meta.rowCount).toBe(2)
      expect(meta.storedRowCount).toBe(2)
      expect(meta.truncated).toBe(false)
      expect(meta.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(meta.keyStrategy).toBe('primary_key')
      expect(meta.keyColumns).toEqual(['id'])
      expect(meta.hasRows).toBe(true)
    })

    it('lists runs newest-first without payloads', () => {
      const a = storage.insertRun(payload({ capturedAt: 1000 }), 'fp-1')
      const b = storage.insertRun(payload({ capturedAt: 3000 }), 'fp-1')
      const c = storage.insertRun(payload({ capturedAt: 2000 }), 'fp-1')

      const runs = storage.listRuns('conn-1', 'fp-1')
      expect(runs.map((r) => r.id)).toEqual([b.id, c.id, a.id])
      expect(runs.every((r) => !('rows' in r))).toBe(true)
    })

    it('keeps timelines separate by connection and fingerprint', () => {
      storage.insertRun(payload({ connectionId: 'conn-1' }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-2' }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-1' }), 'fp-2')

      expect(storage.listRuns('conn-1', 'fp-1')).toHaveLength(1)
      expect(storage.listRuns('conn-2', 'fp-1')).toHaveLength(1)
      expect(storage.listRuns('conn-1', 'fp-2')).toHaveLength(1)
    })

    it('gives identical payloads the same content hash', () => {
      const a = storage.insertRun(payload({ capturedAt: 1000 }), 'fp-1')
      const b = storage.insertRun(payload({ capturedAt: 2000 }), 'fp-1')
      const c = storage.insertRun(payload({ capturedAt: 3000, rows: [[9, 'Zed']] }), 'fp-1')

      expect(a.contentHash).toBe(b.contentHash)
      expect(c.contentHash).not.toBe(a.contentHash)
    })
  })

  describe('per-query cap', () => {
    it('evicts the oldest runs beyond TM_MAX_RUNS_PER_QUERY', () => {
      for (let i = 1; i <= TM_MAX_RUNS_PER_QUERY + 5; i++) {
        storage.insertRun(payload({ capturedAt: i }), 'fp-1')
      }

      const runs = storage.listRuns('conn-1', 'fp-1')
      expect(runs).toHaveLength(TM_MAX_RUNS_PER_QUERY)
      expect(runs[0].capturedAt).toBe(TM_MAX_RUNS_PER_QUERY + 5)
      expect(runs[runs.length - 1].capturedAt).toBe(6)
    })

    it('does not evict runs from other timelines', () => {
      const other = storage.insertRun(payload({ connectionId: 'conn-2', capturedAt: 1 }), 'fp-1')
      for (let i = 1; i <= TM_MAX_RUNS_PER_QUERY + 1; i++) {
        storage.insertRun(payload({ capturedAt: i }), 'fp-1')
      }

      expect(storage.listRuns('conn-2', 'fp-1').map((r) => r.id)).toEqual([other.id])
    })
  })

  describe('global budget', () => {
    it('evicts oldest runs globally until under budget', () => {
      const small = new TimeMachineStorage(tmpDir, { globalBudgetBytes: 100 })
      // Each payload serializes to ~40 bytes, so the budget holds two runs.
      const rows = [['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']]
      const a = small.insertRun(payload({ capturedAt: 1, rows }), 'fp-1')
      const b = small.insertRun(payload({ capturedAt: 2, rows }), 'fp-1')
      const c = small.insertRun(payload({ capturedAt: 3, rows }), 'fp-1')

      const runs = small.listRuns('conn-1', 'fp-1')
      expect(runs.map((r) => r.id)).toEqual([c.id, b.id])
      expect(runs.map((r) => r.id)).not.toContain(a.id)
      small.close()
    })

    it('never evicts the run just inserted, even when it alone exceeds the budget', () => {
      const small = new TimeMachineStorage(tmpDir, { globalBudgetBytes: 50 })
      const big = small.insertRun(payload({ capturedAt: 1, rows: [['y'.repeat(200)]] }), 'fp-1')

      expect(small.listRuns('conn-1', 'fp-1').map((r) => r.id)).toEqual([big.id])
      small.close()
    })

    it('evicts across timelines, oldest first', () => {
      const small = new TimeMachineStorage(tmpDir, { globalBudgetBytes: 100 })
      const rows = [['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']]
      small.insertRun(payload({ connectionId: 'conn-2', capturedAt: 1, rows }), 'fp-2')
      small.insertRun(payload({ capturedAt: 2, rows }), 'fp-1')
      small.insertRun(payload({ capturedAt: 3, rows }), 'fp-1')

      expect(small.listRuns('conn-2', 'fp-2')).toHaveLength(0)
      expect(small.listRuns('conn-1', 'fp-1')).toHaveLength(2)
      small.close()
    })
  })

  describe('payload byte cap', () => {
    it('stores metadata only when the payload exceeds the cap', () => {
      const capped = new TimeMachineStorage(tmpDir, { maxPayloadBytes: 10 })
      const meta = capped.insertRun(payload(), 'fp-1')

      expect(meta.hasRows).toBe(false)
      expect(meta.storedRowCount).toBe(0)
      expect(meta.rowCount).toBe(2)
      expect(capped.listRuns('conn-1', 'fp-1')[0].hasRows).toBe(false)
      expect(() => capped.getSnapshot(meta.id)).toThrow(
        'Snapshot payload was not stored (over size cap)'
      )
      capped.close()
    })
  })

  describe('getSnapshot', () => {
    it('round-trips the columnar payload', () => {
      const input = payload({
        columns: [
          { name: 'id', dataType: 'integer' },
          { name: 'meta', dataType: 'jsonb' },
          { name: 'note', dataType: 'text' }
        ],
        rows: [
          [1, { nested: [1, 2, 3] }, null],
          [2, { nested: [] }, 'it’s "quoted"']
        ]
      })
      const meta = storage.insertRun(input, 'fp-1')

      const snapshot = storage.getSnapshot(meta.id)
      expect(snapshot.id).toBe(meta.id)
      expect(snapshot.columns).toEqual(input.columns)
      expect(snapshot.rows).toEqual(input.rows)
      expect(snapshot.keyColumns).toEqual(['id'])
    })

    it('throws for an unknown id', () => {
      expect(() => storage.getSnapshot('nope')).toThrow('Snapshot not found')
    })
  })

  describe('deleteRun, clearQuery, clearAll', () => {
    it('deletes a single run', () => {
      const a = storage.insertRun(payload({ capturedAt: 1 }), 'fp-1')
      const b = storage.insertRun(payload({ capturedAt: 2 }), 'fp-1')

      storage.deleteRun(a.id)
      expect(storage.listRuns('conn-1', 'fp-1').map((r) => r.id)).toEqual([b.id])
    })

    it('clears one timeline only', () => {
      storage.insertRun(payload(), 'fp-1')
      storage.insertRun(payload(), 'fp-2')

      storage.clearQuery('conn-1', 'fp-1')
      expect(storage.listRuns('conn-1', 'fp-1')).toHaveLength(0)
      expect(storage.listRuns('conn-1', 'fp-2')).toHaveLength(1)
    })

    it('clears one connection when given an id', () => {
      storage.insertRun(payload({ connectionId: 'conn-1' }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-2' }), 'fp-1')

      storage.clearAll('conn-1')
      expect(storage.listRuns('conn-1', 'fp-1')).toHaveLength(0)
      expect(storage.listRuns('conn-2', 'fp-1')).toHaveLength(1)
    })

    it('clears everything when given no id', () => {
      storage.insertRun(payload({ connectionId: 'conn-1' }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-2' }), 'fp-2')

      storage.clearAll()
      expect(storage.stats().runCount).toBe(0)
    })
  })

  describe('stats', () => {
    it('reports zeros for an empty store', () => {
      expect(storage.stats()).toEqual({
        runCount: 0,
        queryCount: 0,
        totalBytes: 0,
        oldestCapturedAt: null
      })
    })

    it('counts runs, distinct query timelines, bytes and oldest capture', () => {
      storage.insertRun(payload({ connectionId: 'conn-1', capturedAt: 500 }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-1', capturedAt: 900 }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-2', capturedAt: 700 }), 'fp-1')
      storage.insertRun(payload({ connectionId: 'conn-1', capturedAt: 800 }), 'fp-2')

      const stats = storage.stats()
      expect(stats.runCount).toBe(4)
      expect(stats.queryCount).toBe(3)
      expect(stats.totalBytes).toBeGreaterThan(0)
      expect(stats.oldestCapturedAt).toBe(500)
    })
  })

  describe('persistence and close', () => {
    it('sets incremental auto_vacuum at creation', () => {
      const raw = new Database(path.join(tmpDir, 'time-machine.db'))
      expect(raw.pragma('auto_vacuum', { simple: true })).toBe(2)
      raw.close()
    })

    it('persists runs across close and reopen', () => {
      const meta = storage.insertRun(payload(), 'fp-1')
      storage.close()

      storage = new TimeMachineStorage(tmpDir)
      const runs = storage.listRuns('conn-1', 'fp-1')
      expect(runs.map((r) => r.id)).toEqual([meta.id])
      expect(storage.getSnapshot(meta.id).rows).toEqual(payload().rows)
    })
  })
})
