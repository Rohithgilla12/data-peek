import mysql from 'mysql2/promise'
import type { ConnectionConfig } from '@shared/index'
import { createLogger } from '../lib/logger'
import { toMySQLConfig } from './mysql-client-config'
import { PoolRegistry } from './pool-registry'

const log = createLogger('mysql-pool')

/**
 * Connection pooling for MySQL.
 *
 * Every adapter method used to open its own connection — and, for SSH connections, its
 * own tunnel — then tear both down again. That meant a full SSH handshake plus a MySQL
 * auth handshake for every schema refresh, every autocomplete lookup, every query.
 * Pooling collapses that to one tunnel and a handful of reused sockets per connection.
 */

const POOL_MAX = 5
const IDLE_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 15_000

const registry = new PoolRegistry<mysql.Pool>({
  driver: 'mysql',
  create: (config, overrides) =>
    mysql.createPool({
      ...toMySQLConfig(config, overrides),
      waitForConnections: true,
      connectionLimit: POOL_MAX,
      idleTimeout: IDLE_TIMEOUT_MS,
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Bound the queue instead of letting it grow without limit: a wedged server
      // should surface as an error, not an ever-growing backlog of pending callers.
      queueLimit: 100,
      // TCP keepalive so a socket killed while idle (laptop sleep, NAT reap, server
      // restart) is detected rather than handed to a caller that then hangs.
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000
    }),
  destroy: (pool) => pool.end()
})

/**
 * Acquire a pooled connection, run `fn`, and release it.
 *
 * Session state set inside `fn` outlives the call — the connection goes back to the
 * pool as-is — so anything that runs `SET SESSION` must reset it. `withMySQLConnection`
 * itself deliberately doesn't blanket-reset, since that would cost a round trip on
 * every query for a case only one caller needs.
 */
export async function withMySQLConnection<T>(
  config: ConnectionConfig,
  fn: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  const connection = await entry.pool.getConnection()
  try {
    return await fn(connection)
  } finally {
    // Always safe: a cancelled query destroys its connection out from under us (see
    // query-tracker), and mysql2's PoolConnection#destroy nulls `_pool`, which makes
    // this release a no-op rather than a double-release.
    connection.release()
  }
}

/**
 * Acquire a pooled connection, BEGIN, run `fn`, then COMMIT (or ROLLBACK on failure).
 */
export async function withMySQLTransaction<T>(
  config: ConnectionConfig,
  fn: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  return withMySQLConnection(config, async (connection) => {
    await connection.beginTransaction()
    try {
      const result = await fn(connection)
      await connection.commit()
      return result
    } catch (error) {
      try {
        await connection.rollback()
      } catch (rollbackErr) {
        // The connection's transaction state is now unknown; destroying it keeps the
        // pool from handing the next caller a connection mid-transaction.
        log.warn('rollback failed:', (rollbackErr as Error).message)
        connection.destroy()
      }
      throw error
    }
  })
}

/** Close the pool (and tunnel) for a single connection. */
export async function closeMySQLPool(config: ConnectionConfig): Promise<void> {
  return registry.close(config)
}

/** Close every MySQL pool. Call on app shutdown. */
export async function closeAllMySQLPools(): Promise<void> {
  return registry.closeAll()
}
