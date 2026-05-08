import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig, SchemaInfo } from '@shared/index'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  safeStorage: { isEncryptionAvailable: vi.fn(() => false) }
}))

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('../storage', () => ({
  DpStorage: class {
    static async create() {
      return new this()
    }
    private state: Record<string, unknown> = { cache: {} }
    get(key: string, fallback?: unknown) {
      return this.state[key] ?? fallback
    }
    set(key: string, value: unknown) {
      this.state[key] = value
    }
  }
}))

import {
  getOrFetchCachedSchema,
  getCachedSchema,
  invalidateSchemaCache,
  initSchemaCache
} from '../schema-cache'

const makeConfig = (id: string): ConnectionConfig => ({
  id,
  name: id,
  host: 'localhost',
  port: 5432,
  database: 'test',
  user: 'u',
  password: 'p',
  dbType: 'postgresql',
  dstPort: 5432
})

const fakeSchemas: SchemaInfo[] = []

describe('getOrFetchCachedSchema dogpile guard', () => {
  beforeEach(async () => {
    await initSchemaCache()
  })

  it('coalesces concurrent fetches to a single underlying fetcher call', async () => {
    const config = makeConfig('dogpile-1')
    invalidateSchemaCache(config)

    let resolveFetcher:
      | ((value: { schemas: SchemaInfo[]; customTypes: []; timestamp: number }) => void)
      | null = null
    const fetcher = vi.fn(
      () =>
        new Promise<{ schemas: SchemaInfo[]; customTypes: []; timestamp: number }>((resolve) => {
          resolveFetcher = resolve
        })
    )

    // Two concurrent callers — both miss cache, both hit getOrFetch.
    const p1 = getOrFetchCachedSchema(config, fetcher)
    const p2 = getOrFetchCachedSchema(config, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)

    // Resolve once; both callers receive the result.
    resolveFetcher!({ schemas: fakeSchemas, customTypes: [], timestamp: 123 })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(r2)
    expect(r1.timestamp).toBe(123)
  })

  it('clears the pending entry after completion so a later call refetches', async () => {
    const config = makeConfig('dogpile-2')
    invalidateSchemaCache(config)

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ schemas: fakeSchemas, customTypes: [], timestamp: 1 })
      .mockResolvedValueOnce({ schemas: fakeSchemas, customTypes: [], timestamp: 2 })

    await getOrFetchCachedSchema(config, fetcher)
    invalidateSchemaCache(config)
    await getOrFetchCachedSchema(config, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('caches the result so subsequent direct cache reads see it', async () => {
    const config = makeConfig('dogpile-3')
    invalidateSchemaCache(config)

    await getOrFetchCachedSchema(config, async () => ({
      schemas: fakeSchemas,
      customTypes: [],
      timestamp: 7777
    }))

    expect(getCachedSchema(config)?.timestamp).toBe(7777)
  })

  it('aborts the cache write when invalidateSchemaCache runs mid-fetch', async () => {
    // Repro for the silent regression: a fetch starts at pre-DDL state, a DDL handler
    // fires `invalidateSchemaCache`, and the fetcher then resolves. Without the
    // generation guard, its setCachedSchema call would repopulate the cache with the
    // pre-DDL data and the next reader would see stale schemas for the full TTL.
    const config = makeConfig('mid-fetch')
    invalidateSchemaCache(config)

    let resolveFetcher: ((value: { schemas: SchemaInfo[]; customTypes: []; timestamp: number }) => void) | null =
      null
    const fetcher = vi.fn(
      () =>
        new Promise<{ schemas: SchemaInfo[]; customTypes: []; timestamp: number }>(
          (resolve) => {
            resolveFetcher = resolve
          }
        )
    )

    const inFlight = getOrFetchCachedSchema(config, fetcher)

    // DDL fires while the fetch is in-flight.
    invalidateSchemaCache(config)

    // Now the fetch resolves — with what would have been pre-DDL data.
    resolveFetcher!({ schemas: fakeSchemas, customTypes: [], timestamp: 999 })
    await inFlight

    // The cache must NOT have been repopulated with the stale result.
    expect(getCachedSchema(config)).toBeUndefined()
  })

  it('keeps a fresh fetch alive when an older fetch finishes after invalidation', async () => {
    // Repro: A starts, invalidate runs, C starts a fresh fetch, A finishes. The old
    // finally must not delete C's pendingFetches entry, otherwise a fourth caller D
    // would dogpile (start a third underlying fetcher) instead of waiting for C.
    const config = makeConfig('ownership')
    invalidateSchemaCache(config)

    let resolveA: ((v: { schemas: SchemaInfo[]; customTypes: []; timestamp: number }) => void) | null = null
    const fetcherA = vi.fn(
      () => new Promise<{ schemas: SchemaInfo[]; customTypes: []; timestamp: number }>((r) => {
        resolveA = r
      })
    )
    const fetchA = getOrFetchCachedSchema(config, fetcherA)

    invalidateSchemaCache(config)

    let resolveC: ((v: { schemas: SchemaInfo[]; customTypes: []; timestamp: number }) => void) | null = null
    const fetcherC = vi.fn(
      () => new Promise<{ schemas: SchemaInfo[]; customTypes: []; timestamp: number }>((r) => {
        resolveC = r
      })
    )
    const fetchC = getOrFetchCachedSchema(config, fetcherC)

    // A finishes first — its finally must NOT delete C's slot.
    resolveA!({ schemas: fakeSchemas, customTypes: [], timestamp: 1 })
    await fetchA

    // D arrives now and should coalesce with C, not start a third fetcher.
    const fetcherD = vi.fn()
    const fetchD = getOrFetchCachedSchema(config, fetcherD)
    expect(fetcherD).not.toHaveBeenCalled()

    resolveC!({ schemas: fakeSchemas, customTypes: [], timestamp: 2 })
    await Promise.all([fetchC, fetchD])

    expect(fetcherC).toHaveBeenCalledTimes(1)
    expect(fetcherD).toHaveBeenCalledTimes(0)
    expect(getCachedSchema(config)?.timestamp).toBe(2)
  })

  it('does not coalesce fetches across different connection ids', async () => {
    const a = makeConfig('dogpile-a')
    const b = makeConfig('dogpile-b')
    invalidateSchemaCache(a)
    invalidateSchemaCache(b)

    const fetcherA = vi
      .fn()
      .mockResolvedValue({ schemas: fakeSchemas, customTypes: [], timestamp: 1 })
    const fetcherB = vi
      .fn()
      .mockResolvedValue({ schemas: fakeSchemas, customTypes: [], timestamp: 2 })

    await Promise.all([getOrFetchCachedSchema(a, fetcherA), getOrFetchCachedSchema(b, fetcherB)])

    expect(fetcherA).toHaveBeenCalledTimes(1)
    expect(fetcherB).toHaveBeenCalledTimes(1)
  })
})
