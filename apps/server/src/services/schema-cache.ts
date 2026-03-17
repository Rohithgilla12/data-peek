import type { ConnectionConfig, SchemaInfo, CustomTypeInfo } from '@shared/index'
import { ServerStorage } from '../server-storage.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('schema-cache')

export interface CachedSchema {
  schemas: SchemaInfo[]
  customTypes: CustomTypeInfo[]
  timestamp: number
}

interface SchemaCacheStore {
  cache: Record<string, CachedSchema>
}

// 24-hour TTL
export const SCHEMA_CACHE_TTL = 24 * 60 * 60 * 1000

// In-memory cache
const schemaMemoryCache = new Map<string, CachedSchema>()

let schemaCacheStore: ServerStorage<SchemaCacheStore> | null = null

export function initSchemaCache(dataDir: string): void {
  schemaCacheStore = ServerStorage.create<SchemaCacheStore>({
    name: 'data-peek-schema-cache',
    defaults: { cache: {} },
    dataDir
  })

  const diskCache = schemaCacheStore.get('cache', {})
  for (const [key, value] of Object.entries(diskCache)) {
    schemaMemoryCache.set(key, value)
  }
  log.debug(`Loaded ${schemaMemoryCache.size} cached schemas from disk`)
}

export function getSchemaCacheKey(config: ConnectionConfig): string {
  return `${config.dbType}:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

export function getCachedSchema(config: ConnectionConfig): CachedSchema | undefined {
  return schemaMemoryCache.get(getSchemaCacheKey(config))
}

export function isCacheValid(cached: CachedSchema): boolean {
  return Date.now() - cached.timestamp < SCHEMA_CACHE_TTL
}

export function setCachedSchema(config: ConnectionConfig, cacheEntry: CachedSchema): void {
  if (!schemaCacheStore) {
    log.warn('Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)
  schemaMemoryCache.set(cacheKey, cacheEntry)

  const allCache = schemaCacheStore.get('cache', {})
  allCache[cacheKey] = cacheEntry
  schemaCacheStore.set('cache', allCache)
  log.debug(`Cached schemas for ${cacheKey}`)
}

export function invalidateSchemaCache(config: ConnectionConfig): void {
  if (!schemaCacheStore) {
    log.warn('Cache store not initialized')
    return
  }

  const cacheKey = getSchemaCacheKey(config)
  schemaMemoryCache.delete(cacheKey)

  const allCache = schemaCacheStore.get('cache', {})
  delete allCache[cacheKey]
  schemaCacheStore.set('cache', allCache)
  log.debug(`Invalidated cache for ${cacheKey}`)
}
