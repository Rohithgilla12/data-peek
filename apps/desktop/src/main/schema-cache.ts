import type { ConnectionConfig, SchemaInfo } from '@shared/index'
import { DpStorage } from './storage'

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

// In-memory cache for faster access during session
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

  // Load disk cache into memory on startup
  const diskCache = schemaCacheStore.get('cache', {})
  for (const [key, value] of Object.entries(diskCache)) {
    schemaMemoryCache.set(key, value)
  }
  console.log(`[schema-cache] Loaded ${schemaMemoryCache.size} cached schemas from disk`)
}

/**
 * Generate cache key from connection config
 */
export function getSchemaCacheKey(config: ConnectionConfig): string {
  return `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

/**
 * Get cached schema from memory
 */
export function getCachedSchema(config: ConnectionConfig): CachedSchema | undefined {
  const cacheKey = getSchemaCacheKey(config)
  return schemaMemoryCache.get(cacheKey)
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
    console.warn('[schema-cache] Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)

  // Update memory cache
  schemaMemoryCache.set(cacheKey, cacheEntry)

  // Persist to disk
  const allCache = schemaCacheStore.get('cache', {})
  allCache[cacheKey] = cacheEntry
  schemaCacheStore.set('cache', allCache)

  console.log(`[schema-cache] Cached schemas for ${cacheKey}`)
}

/**
 * Invalidate cache for a connection
 */
export function invalidateSchemaCache(config: ConnectionConfig): void {
  if (!schemaCacheStore) {
    console.warn('[schema-cache] Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)

  // Remove from memory cache
  schemaMemoryCache.delete(cacheKey)

  // Remove from disk cache
  const allCache = schemaCacheStore.get('cache', {})
  delete allCache[cacheKey]
  schemaCacheStore.set('cache', allCache)

  console.log(`[schema-cache] Invalidated cache for ${cacheKey}`)
}
