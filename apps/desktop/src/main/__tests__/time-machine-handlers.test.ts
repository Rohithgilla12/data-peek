import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TimeMachineCapturePayload, TimeMachineRunMeta } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    })
  }
}))

import { registerTimeMachineHandlers } from '../ipc/time-machine-handlers'
import { fingerprintQuery } from '../lib/query-fingerprint'
import type { TimeMachineStorage } from '../time-machine-storage'

const CHANNELS = [
  'time-machine:capture',
  'time-machine:list-runs',
  'time-machine:get-snapshot',
  'time-machine:delete-run',
  'time-machine:clear-query',
  'time-machine:clear-all',
  'time-machine:stats'
]

function meta(overrides: Partial<TimeMachineRunMeta> = {}): TimeMachineRunMeta {
  return {
    id: 'run-1',
    connectionId: 'conn-1',
    fingerprint: 'fp-1',
    sql: 'SELECT 1',
    capturedAt: 1000,
    durationMs: 5,
    rowCount: 1,
    storedRowCount: 1,
    truncated: false,
    contentHash: 'hash',
    keyStrategy: 'primary_key',
    keyColumns: ['id'],
    hasRows: true,
    ...overrides
  }
}

function payload(overrides: Partial<TimeMachineCapturePayload> = {}): TimeMachineCapturePayload {
  return {
    connectionId: 'conn-1',
    sql: 'SELECT * FROM t WHERE id = 1',
    capturedAt: 1000,
    durationMs: 5,
    rowCount: 1,
    truncated: false,
    keyStrategy: 'primary_key',
    keyColumns: ['id'],
    columns: [{ name: 'id', dataType: 'integer' }],
    rows: [[1]],
    ...overrides
  }
}

function makeStorage() {
  return {
    insertRun: vi.fn((_payload: TimeMachineCapturePayload, fingerprint: string) =>
      meta({ fingerprint })
    ),
    listRuns: vi.fn(() => [meta()]),
    getSnapshot: vi.fn(() => ({ ...meta(), columns: [], rows: [] })),
    deleteRun: vi.fn(),
    clearQuery: vi.fn(),
    clearAll: vi.fn(),
    stats: vi.fn(() => ({ runCount: 0, queryCount: 0, totalBytes: 0, oldestCapturedAt: null }))
  }
}

beforeEach(() => {
  handlers.clear()
})

describe('registration', () => {
  it('registers all time-machine channels', () => {
    registerTimeMachineHandlers(makeStorage() as unknown as TimeMachineStorage)
    for (const channel of CHANNELS) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  it('registers nothing when storage is null', () => {
    registerTimeMachineHandlers(null)
    expect(handlers.size).toBe(0)
  })
})

describe('time-machine:capture', () => {
  it('fingerprints the sql and returns the inserted meta', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const input = payload()
    const result = handlers.get('time-machine:capture')!(null, input) as {
      success: boolean
      data: TimeMachineRunMeta
    }

    expect(result.success).toBe(true)
    expect(storage.insertRun).toHaveBeenCalledWith(input, fingerprintQuery(input.sql))
    expect(result.data.fingerprint).toBe(fingerprintQuery(input.sql))
  })

  it('normalizes literals into a shared fingerprint', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)
    const capture = handlers.get('time-machine:capture')!

    capture(null, payload({ sql: 'SELECT * FROM t WHERE id = 1' }))
    capture(null, payload({ sql: 'SELECT * FROM t WHERE id = 2' }))
    capture(null, payload({ sql: 'SELECT * FROM other WHERE id = 1' }))

    const fingerprints = storage.insertRun.mock.calls.map((call) => call[1])
    expect(fingerprints[0]).toBe(fingerprints[1])
    expect(fingerprints[2]).not.toBe(fingerprints[0])
  })

  it.each([
    ['missing connectionId', payload({ connectionId: '' })],
    ['missing sql', payload({ sql: '' })],
    ['non-array rows', { ...payload(), rows: 'nope' } as unknown as TimeMachineCapturePayload]
  ])('rejects invalid payloads: %s', (_label, invalid) => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:capture')!(null, invalid) as {
      success: boolean
      error: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid capture payload')
    expect(storage.insertRun).not.toHaveBeenCalled()
  })

  it('returns an error envelope when the storage throws', () => {
    const storage = makeStorage()
    storage.insertRun.mockImplementation(() => {
      throw new Error('disk full')
    })
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:capture')!(null, payload()) as {
      success: boolean
      error: string
    }

    expect(result).toEqual({ success: false, error: 'disk full' })
  })
})

describe('time-machine:list-runs', () => {
  it('fingerprints the sql and returns fingerprint plus runs', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const sql = 'SELECT * FROM t WHERE id = 42'
    const result = handlers.get('time-machine:list-runs')!(null, {
      connectionId: 'conn-1',
      sql
    }) as { success: boolean; data: { fingerprint: string; runs: TimeMachineRunMeta[] } }

    expect(result.success).toBe(true)
    expect(result.data.fingerprint).toBe(fingerprintQuery(sql))
    expect(result.data.runs).toHaveLength(1)
    expect(storage.listRuns).toHaveBeenCalledWith('conn-1', fingerprintQuery(sql))
  })
})

describe('time-machine:get-snapshot', () => {
  it('returns the snapshot', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:get-snapshot')!(null, 'run-1') as {
      success: boolean
      data: { id: string }
    }

    expect(result.success).toBe(true)
    expect(result.data.id).toBe('run-1')
    expect(storage.getSnapshot).toHaveBeenCalledWith('run-1')
  })

  it('returns the storage error for metadata-only runs', () => {
    const storage = makeStorage()
    storage.getSnapshot.mockImplementation(() => {
      throw new Error('Snapshot payload was not stored (over size cap)')
    })
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:get-snapshot')!(null, 'run-1') as {
      success: boolean
      error: string
    }

    expect(result).toEqual({
      success: false,
      error: 'Snapshot payload was not stored (over size cap)'
    })
  })
})

describe('time-machine:delete-run', () => {
  it('deletes by id', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:delete-run')!(null, 'run-1') as { success: boolean }

    expect(result.success).toBe(true)
    expect(storage.deleteRun).toHaveBeenCalledWith('run-1')
  })
})

describe('time-machine:clear-query', () => {
  it('fingerprints the sql before clearing', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const sql = 'SELECT * FROM t WHERE id = 7'
    const result = handlers.get('time-machine:clear-query')!(null, {
      connectionId: 'conn-1',
      sql
    }) as { success: boolean }

    expect(result.success).toBe(true)
    expect(storage.clearQuery).toHaveBeenCalledWith('conn-1', fingerprintQuery(sql))
  })
})

describe('time-machine:clear-all', () => {
  it('clears one connection when given an id', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    handlers.get('time-machine:clear-all')!(null, 'conn-1')
    expect(storage.clearAll).toHaveBeenCalledWith('conn-1')
  })

  it('clears everything when given no id', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:clear-all')!(null) as { success: boolean }
    expect(result.success).toBe(true)
    expect(storage.clearAll).toHaveBeenCalledWith(undefined)
  })
})

describe('time-machine:stats', () => {
  it('returns storage stats', () => {
    const storage = makeStorage()
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:stats')!(null) as {
      success: boolean
      data: { runCount: number }
    }

    expect(result.success).toBe(true)
    expect(result.data.runCount).toBe(0)
  })

  it('returns an error envelope when stats throws', () => {
    const storage = makeStorage()
    storage.stats.mockImplementation(() => {
      throw new Error('db closed')
    })
    registerTimeMachineHandlers(storage as unknown as TimeMachineStorage)

    const result = handlers.get('time-machine:stats')!(null) as {
      success: boolean
      error: string
    }

    expect(result).toEqual({ success: false, error: 'db closed' })
  })
})
