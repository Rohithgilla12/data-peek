import type {
  WebDatabaseAdapter,
  ConnectionCredentials,
} from './adapters/types'
import { PostgresWebAdapter } from './adapters/postgres'
import { MySQLWebAdapter } from './adapters/mysql'
import { decryptCredentials } from './encryption'

interface CachedConnection {
  adapter: WebDatabaseAdapter
  userId: string
  lastUsed: number
}

const connectionCache = new Map<string, CachedConnection>()
const CACHE_TTL_MS = 15_000

function cacheKey(userId: string, connectionId: string): string {
  return `${userId}:${connectionId}`
}

function cleanupStaleConnections() {
  const now = Date.now()
  for (const [key, cached] of connectionCache) {
    if (now - cached.lastUsed > CACHE_TTL_MS) {
      cached.adapter.disconnect().catch((err) => {
        console.error('Failed to disconnect stale connection', {
          key,
          error: err,
        })
      })
      connectionCache.delete(key)
    }
  }
}

function createAdapter(dbType: string): WebDatabaseAdapter {
  switch (dbType) {
    case 'postgresql':
      return new PostgresWebAdapter()
    case 'mysql':
      return new MySQLWebAdapter()
    default:
      throw new Error(`Unsupported database type: ${dbType}`)
  }
}

export async function getAdapter(
  connectionId: string,
  dbType: string,
  encryptedCredentials: Buffer,
  iv: Buffer,
  authTag: Buffer,
  userId: string
): Promise<WebDatabaseAdapter> {
  cleanupStaleConnections()

  const key = cacheKey(userId, connectionId)
  const cached = connectionCache.get(key)
  if (cached && Date.now() - cached.lastUsed < CACHE_TTL_MS) {
    cached.lastUsed = Date.now()
    return cached.adapter
  }

  const creds = decryptCredentials(
    encryptedCredentials,
    iv,
    authTag,
    userId
  ) as ConnectionCredentials

  const adapter = createAdapter(dbType)

  await adapter.connect(creds)

  connectionCache.set(key, { adapter, userId, lastUsed: Date.now() })

  return adapter
}

export async function releaseAdapter(
  connectionId: string,
  userId: string
): Promise<void> {
  const key = cacheKey(userId, connectionId)
  const cached = connectionCache.get(key)
  if (cached) {
    await cached.adapter.disconnect().catch((err) => {
      console.error('Failed to release adapter connection', {
        key,
        error: err,
      })
    })
    connectionCache.delete(key)
  }
}
