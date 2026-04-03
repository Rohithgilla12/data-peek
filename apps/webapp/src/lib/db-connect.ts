import type { WebDatabaseAdapter, ConnectionCredentials } from './adapters/types'
import { PostgresWebAdapter } from './adapters/postgres'
import { MySQLWebAdapter } from './adapters/mysql'
import { decryptCredentials } from './encryption'

interface CachedConnection {
  adapter: WebDatabaseAdapter
  lastUsed: number
}

const connectionCache = new Map<string, CachedConnection>()
const CACHE_TTL_MS = 60_000

function cleanupStaleConnections() {
  const now = Date.now()
  for (const [key, cached] of connectionCache) {
    if (now - cached.lastUsed > CACHE_TTL_MS) {
      cached.adapter.disconnect().catch(() => {})
      connectionCache.delete(key)
    }
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

  const cached = connectionCache.get(connectionId)
  if (cached && Date.now() - cached.lastUsed < CACHE_TTL_MS) {
    cached.lastUsed = Date.now()
    return cached.adapter
  }

  const creds = decryptCredentials(encryptedCredentials, iv, authTag, userId) as ConnectionCredentials

  const adapter =
    dbType === 'postgresql' ? new PostgresWebAdapter() : new MySQLWebAdapter()

  await adapter.connect(creds)

  connectionCache.set(connectionId, { adapter, lastUsed: Date.now() })

  return adapter
}

export async function releaseAdapter(connectionId: string): Promise<void> {
  const cached = connectionCache.get(connectionId)
  if (cached) {
    await cached.adapter.disconnect().catch(() => {})
    connectionCache.delete(connectionId)
  }
}
