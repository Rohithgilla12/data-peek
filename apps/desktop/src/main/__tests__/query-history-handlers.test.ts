import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_QUERY_HISTORY_PER_CONNECTION, type QueryHistoryEntry } from '@shared/index'

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

import { registerQueryHistoryHandlers } from '../ipc/query-history-handlers'
import type { DpStorage } from '../storage'

function makeStore(initial: QueryHistoryEntry[]) {
  let state = initial
  return {
    get: vi.fn((_key: string, fallback?: QueryHistoryEntry[]) => state ?? fallback),
    set: vi.fn((_key: string, value: QueryHistoryEntry[]) => {
      state = value
    })
  } as unknown as DpStorage<{ queryHistory: QueryHistoryEntry[] }>
}

function entry(overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry {
  return {
    id: overrides.id ?? `id-${Math.random()}`,
    query: 'SELECT 1',
    timestamp: 1000,
    durationMs: 5,
    rowCount: 1,
    status: 'success',
    connectionId: 'conn-1',
    ...overrides
  }
}

beforeEach(() => {
  handlers.clear()
})

describe('query-history:list', () => {
  it('returns the stored history', () => {
    const items = [entry({ id: 'a' }), entry({ id: 'b' })]
    registerQueryHistoryHandlers(makeStore(items))

    const result = handlers.get('query-history:list')!(null) as {
      success: boolean
      data: QueryHistoryEntry[]
    }

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })
})

describe('query-history:add', () => {
  it('prepends the new entry (newest first)', () => {
    const store = makeStore([entry({ id: 'old' })])
    registerQueryHistoryHandlers(store)

    handlers.get('query-history:add')!(null, entry({ id: 'new' }))

    const stored = store.get('queryHistory') as QueryHistoryEntry[]
    expect(stored.map((h) => h.id)).toEqual(['new', 'old'])
  })

  it('caps history per connection without evicting other connections', () => {
    const existing: QueryHistoryEntry[] = Array.from(
      { length: MAX_QUERY_HISTORY_PER_CONNECTION },
      (_, i) => entry({ id: `c1-${i}`, connectionId: 'conn-1' })
    )
    existing.push(entry({ id: 'c2-keep', connectionId: 'conn-2' }))
    const store = makeStore(existing)
    registerQueryHistoryHandlers(store)

    handlers.get('query-history:add')!(null, entry({ id: 'c1-new', connectionId: 'conn-1' }))

    const stored = store.get('queryHistory') as QueryHistoryEntry[]
    const conn1 = stored.filter((h) => h.connectionId === 'conn-1')
    expect(conn1).toHaveLength(MAX_QUERY_HISTORY_PER_CONNECTION)
    expect(conn1[0].id).toBe('c1-new')
    // The oldest conn-1 entry is evicted, conn-2 untouched.
    expect(stored.some((h) => h.id === 'c1-99')).toBe(false)
    expect(stored.some((h) => h.id === 'c2-keep')).toBe(true)
  })
})

describe('query-history:remove', () => {
  it('removes the entry by id', () => {
    const store = makeStore([entry({ id: 'a' }), entry({ id: 'b' })])
    registerQueryHistoryHandlers(store)

    handlers.get('query-history:remove')!(null, 'a')

    const stored = store.get('queryHistory') as QueryHistoryEntry[]
    expect(stored.map((h) => h.id)).toEqual(['b'])
  })
})

describe('query-history:clear', () => {
  it('clears all history when no connection id is given', () => {
    const store = makeStore([entry({ id: 'a', connectionId: 'conn-1' })])
    registerQueryHistoryHandlers(store)

    handlers.get('query-history:clear')!(null)

    expect(store.get('queryHistory')).toEqual([])
  })

  it('clears only the given connection when a connection id is provided', () => {
    const store = makeStore([
      entry({ id: 'a', connectionId: 'conn-1' }),
      entry({ id: 'b', connectionId: 'conn-2' })
    ])
    registerQueryHistoryHandlers(store)

    handlers.get('query-history:clear')!(null, 'conn-1')

    const stored = store.get('queryHistory') as QueryHistoryEntry[]
    expect(stored.map((h) => h.id)).toEqual(['b'])
  })
})
