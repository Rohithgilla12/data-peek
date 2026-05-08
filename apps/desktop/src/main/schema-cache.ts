import type { ConnectionConfig, SchemaInfo } from '@shared/index'
import { DpStorage } from './storage'
import { createLogger } from './lib/logger'

const log = createLogger('schema-cache')

// Schema cache types
export interface CachedSchema {
  schemas: SchemaInfo[]
  customTypes: { name: string; schema: string; type: string; values?: string[] }[]
  timestamp: number
}

interface SchemaCacheStore {
  cache: Record<string, CachedSchema>
}

// Schema cache TTL - 24 hours (cached schemas are refreshed in background anyway)
export const SCHEMA_CACHE_TTL = 24 * 60 * 60 * 1000

// Bound the in-memory cache so a long session over many connections doesn't grow unbounded.
const MAX_CACHE_ENTRIES = 30

// In-memory cache for faster access during session.
// Map preserves insertion order; we delete + re-set on access to maintain LRU order.
const schemaMemoryCache = new Map<string, CachedSchema>()

// In-flight fetch promises keyed by connection cache key. Used to coalesce concurrent
// db:schemas requests so two tabs opening at the same time don't each trigger a full
// pg_catalog scan against the same connection.
const pendingFetches = new Map<string, Promise<CachedSchema>>()

// Per-key generation counter. invalidateSchemaCache bumps it; in-flight fetchers
// capture the value at start, and refuse to write their result if the generation has
// moved on. This is the lock that prevents an old, slow `getSchemas` from undoing a
// post-DDL invalidation by repopulating the cache with pre-DDL data.
const cacheGenerations = new Map<string, number>()

let schemaCacheStore: DpStorage<SchemaCacheStore> | null = null

/**
 * Initialize the schema cache store
 */
export async function initSchemaCache(): Promise<void> {
  schemaCacheStore = await DpStorage.create<SchemaCacheStore>({
    name: 'data-peek-schema-cache',
    defaults: {
      cache: {}
    }
  })

  // Load most-recent disk entries into memory on startup, capped at MAX_CACHE_ENTRIES
  // so the cold start doesn't slurp megabytes of stale schemas for connections we may not touch.
  const diskCache = schemaCacheStore.get('cache', {})
  const sorted = Object.entries(diskCache).sort((a, b) => b[1].timestamp - a[1].timestamp)
  for (const [key, value] of sorted.slice(0, MAX_CACHE_ENTRIES)) {
    schemaMemoryCache.set(key, value)
  }
  log.debug(`Loaded ${schemaMemoryCache.size} cached schemas from disk`)
}

/**
 * Generate cache key from connection config.
 * Uses the saved-connection id so cached schemas can't bleed between connections that
 * differ only in ssh tunnel or ssl options. Falls back to host-based key for unsaved configs.
 */
export function getSchemaCacheKey(config: ConnectionConfig): string {
  if (config.id) return `${config.dbType}:${config.id}`
  return `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

/**
 * Get cached schema from memory
 */
export function getCachedSchema(config: ConnectionConfig): CachedSchema | undefined {
  const cacheKey = getSchemaCacheKey(config)
  const entry = schemaMemoryCache.get(cacheKey)
  if (entry) {
    // Bump LRU recency
    schemaMemoryCache.delete(cacheKey)
    schemaMemoryCache.set(cacheKey, entry)
  }
  return entry
}

/**
 * Check if cached schema is still valid (not expired)
 */
export function isCacheValid(cached: CachedSchema): boolean {
  return Date.now() - cached.timestamp < SCHEMA_CACHE_TTL
}

/**
 * Store schema in both memory and disk cache
 */
export function setCachedSchema(config: ConnectionConfig, cacheEntry: CachedSchema): void {
  if (!schemaCacheStore) {
    log.warn('Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)

  // Update memory cache (delete-then-set keeps insertion order = recency for LRU)
  schemaMemoryCache.delete(cacheKey)
  schemaMemoryCache.set(cacheKey, cacheEntry)

  // Evict oldest if we've exceeded the bound
  while (schemaMemoryCache.size > MAX_CACHE_ENTRIES) {
    const oldest = schemaMemoryCache.keys().next().value
    if (oldest === undefined) break
    schemaMemoryCache.delete(oldest)
  }

  // Persist to disk
  const allCache = schemaCacheStore.get('cache', {})
  allCache[cacheKey] = cacheEntry
  schemaCacheStore.set('cache', allCache)

  log.debug(`Cached schemas for ${cacheKey}`)
}

/**
 * Coalesce concurrent fetches for the same connection. Returns an existing in-flight
 * promise if one is already running for this key; otherwise runs `fetcher`, stores the
 * result via setCachedSchema, and resolves all callers with the same value.
 *
 * The fetcher captures the cache generation at start. If `invalidateSchemaCache` runs
 * during the fetch (e.g. a DDL handler fires while we're mid-pg_catalog-scan), the
 * generation moves on and the fetcher's write is suppressed — otherwise the fetcher's
 * pre-DDL result would silently undo the invalidation. The same ownership check guards
 * the `pendingFetches` cleanup so a stale finally can't delete a newer fetcher's slot.
 */
export function getOrFetchCachedSchema(
  config: ConnectionConfig,
  fetcher: () => Promise<CachedSchema>
): Promise<CachedSchema> {
  const key = getSchemaCacheKey(config)
  const existing = pendingFetches.get(key)
  if (existing) return existing

  const startGeneration = cacheGenerations.get(key) ?? 0
  // Use a box so the run closure can refer to its own promise without TDZ issues.
  const handle: { promise: Promise<CachedSchema> | null } = { promise: null }

  const run = async (): Promise<CachedSchema> => {
    try {
      const result = await fetcher()
      // Only persist if no invalidation has run since we started AND we still own
      // the slot. Either condition failing means our result is stale.
      if (
        (cacheGenerations.get(key) ?? 0) === startGeneration &&
        pendingFetches.get(key) === handle.promise
      ) {
        setCachedSchema(config, result)
      }
      return result
    } finally {
      // Only clear our own slot — a newer fetch may have taken over after invalidation.
      if (pendingFetches.get(key) === handle.promise) {
        pendingFetches.delete(key)
      }
    }
  }

  const promise = run()
  handle.promise = promise
  pendingFetches.set(key, promise)
  return promise
}

/**
 * Invalidate cache for a connection
 */
export function invalidateSchemaCache(config: ConnectionConfig): void {
  const cacheKey = getSchemaCacheKey(config)

  // Bump the generation BEFORE clearing pendingFetches so any in-flight fetcher
  // that's already past its `await fetcher()` and about to call setCachedSchema
  // still sees the new generation and aborts the write.
  cacheGenerations.set(cacheKey, (cacheGenerations.get(cacheKey) ?? 0) + 1)

  // Pure in-memory ops happen unconditionally — they don't depend on the disk store
  // being initialised. Skipping these because the store hasn't booted would silently
  // leave a stale entry in memory and let an in-flight fetch repopulate the disk
  // cache once the store is ready.
  schemaMemoryCache.delete(cacheKey)
  pendingFetches.delete(cacheKey)

  if (!schemaCacheStore) {
    log.warn('Cache store not initialized; in-memory invalidation only')
    return
  }

  const allCache = schemaCacheStore.get('cache', {})
  delete allCache[cacheKey]
  schemaCacheStore.set('cache', allCache)

  log.debug(`Invalidated cache for ${cacheKey}`)
}
