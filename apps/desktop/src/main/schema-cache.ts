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
 * Invalidate cache for a connection
 */
export function invalidateSchemaCache(config: ConnectionConfig): void {
  if (!schemaCacheStore) {
    log.warn('Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)

  // Remove from memory cache
  schemaMemoryCache.delete(cacheKey)

  // Remove from disk cache
  const allCache = schemaCacheStore.get('cache', {})
  delete allCache[cacheKey]
  schemaCacheStore.set('cache', allCache)

  log.debug(`Invalidated cache for ${cacheKey}`)
}
