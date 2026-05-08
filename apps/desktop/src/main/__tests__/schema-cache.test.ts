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
