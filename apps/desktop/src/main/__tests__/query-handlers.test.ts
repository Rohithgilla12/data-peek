import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers, queryMultiple } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  queryMultiple: vi.fn()
}))

// Capture handlers as they register, and stub the collaborators db:query touches.
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    }
  }
}))
vi.mock('../db-adapter', () => ({ getAdapter: () => ({ queryMultiple }) }))
vi.mock('../schema-cache', () => ({
  getCachedSchema: vi.fn(),
  isCacheValid: vi.fn(),
  getOrFetchCachedSchema: vi.fn(),
  invalidateSchemaCache: vi.fn()
}))
vi.mock('../lib/ssl-error', () => ({ annotateSslError: (e: Error) => e }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { registerQueryHandlers } from '../ipc/query-handlers'

interface QueryResponse {
  success: boolean
  error?: string
  data?: {
    rows: unknown[]
    fields: unknown[]
    rowCount: number
    statementCount: number
  }
}

const config = { id: 'c1', dbType: 'postgresql' } as unknown as ConnectionConfig

function runQuery(query: string): Promise<QueryResponse> {
  return handlers.get('db:query')!(null, { config, query }) as Promise<QueryResponse>
}

beforeEach(() => {
  handlers.clear()
  queryMultiple.mockReset()
  registerQueryHandlers()
})

describe('db:query legacy field selection', () => {
  it('returns rows/fields/rowCount from the first data-returning statement, not statement 0', async () => {
    queryMultiple.mockResolvedValue({
      totalDurationMs: 12,
      results: [
        { isDataReturning: false, rows: [], fields: [], rowCount: 3 },
        { isDataReturning: true, rows: [{ id: 7 }], fields: [{ name: 'id' }], rowCount: 1 }
      ]
    })

    const res = await runQuery('update x set a = 1; select * from x')

    expect(res.success).toBe(true)
    expect(res.data?.rows).toEqual([{ id: 7 }])
    expect(res.data?.fields).toEqual([{ name: 'id' }])
    expect(res.data?.rowCount).toBe(1)
    expect(res.data?.statementCount).toBe(2)
  })

  it('falls back to the first statement when none are data-returning', async () => {
    queryMultiple.mockResolvedValue({
      totalDurationMs: 4,
      results: [
        {
          isDataReturning: false,
          rows: [{ changes: 2 }],
          fields: [{ name: 'changes' }],
          rowCount: 2
        }
      ]
    })

    const res = await runQuery('update x set a = 1')

    expect(res.data?.rows).toEqual([{ changes: 2 }])
    expect(res.data?.rowCount).toBe(2)
  })

  it('uses empty defaults when there are no results at all', async () => {
    queryMultiple.mockResolvedValue({ totalDurationMs: 1, results: [] })

    const res = await runQuery('-- noop')

    expect(res.success).toBe(true)
    expect(res.data?.rows).toEqual([])
    expect(res.data?.fields).toEqual([])
    expect(res.data?.rowCount).toBe(0)
    expect(res.data?.statementCount).toBe(0)
  })
})

describe('db:query error handling', () => {
  it('maps an adapter Error to { success: false, error }', async () => {
    queryMultiple.mockRejectedValue(new Error('boom'))

    const res = await runQuery('select 1')

    expect(res).toEqual({ success: false, error: 'boom' })
  })

  it('stringifies non-Error throwables', async () => {
    queryMultiple.mockRejectedValue('plain string failure')

    const res = await runQuery('select 1')

    expect(res.success).toBe(false)
    expect(res.error).toBe('plain string failure')
  })
})
