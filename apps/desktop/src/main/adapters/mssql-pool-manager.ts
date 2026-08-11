import sql from 'mssql'
import type { ConnectionConfig } from '@shared/index'
import { createLogger } from '../lib/logger'
import { toMSSQLConfig } from './mssql-client-config'
import { PoolRegistry } from './pool-registry'

const log = createLogger('mssql-pool')

/**
 * Connection pooling for SQL Server.
 *
 * `mssql.ConnectionPool` already pools internally — the problem was that every adapter
 * method built, connected and closed a *fresh* one (plus a fresh SSH tunnel) per call,
 * so the pooling never actually applied. Keeping one connected pool per connection
 * shape is what makes it real.
 */

const POOL_MAX = 5
const POOL_MIN = 0
const IDLE_TIMEOUT_MS = 30_000

const registry = new PoolRegistry<sql.ConnectionPool>({
  driver: 'mssql',
  // Driver flags (encrypt, trustServerCertificate, auth mode) are baked into the
  // handshake, so changing them has to force a new pool.
  fingerprintExtras: (config) => config.mssqlOptions ?? null,
  create: async (config, overrides) => {
    const pool = new sql.ConnectionPool({
      ...toMSSQLConfig(config, overrides),
      pool: { max: POOL_MAX, min: POOL_MIN, idleTimeoutMillis: IDLE_TIMEOUT_MS }
    })
    // Without a listener, a pool-level error (a socket dying while idle) is an unhandled
    // 'error' event and takes the process down. Log it rather than swallowing: it's the
    // only trace of why a later query on this connection failed or hung.
    pool.on('error', (err: Error) => {
      log.warn('idle pool error:', err.message)
    })
    await pool.connect()
    return pool
  },
  destroy: (pool) => pool.close()
})

/**
 * Run `fn` against the connection's pool.
 *
 * Note that `pool.request()` may run on *any* connection in the pool, so consecutive
 * requests are not guaranteed to share session state. Anything that depends on a `SET`
 * from a previous statement must use `withMSSQLTransaction`, which pins one connection.
 */
export async function withMSSQLPool<T>(
  config: ConnectionConfig,
  fn: (pool: sql.ConnectionPool) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  return fn(entry.pool)
}

/**
 * Run `fn` inside a transaction, which pins every request to one connection.
 *
 * This is the only way to make session-scoped `SET` statements (SHOWPLAN_XML,
 * STATISTICS XML) apply to the statement that follows them, since a bare
 * `pool.request()` can land on a different connection each time.
 */
export async function withMSSQLTransaction<T>(
  config: ConnectionConfig,
  fn: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  const transaction = new sql.Transaction(entry.pool)
  await transaction.begin()
  let committed = false
  try {
    const result = await fn(transaction)
    await transaction.commit()
    committed = true
    return result
  } finally {
    if (!committed) {
      await transaction.rollback().catch(() => {
        // Already rolled back, or the connection died; either way the pool reclaims it.
      })
    }
  }
}

/**
 * Run `fn` against a throwaway pool of exactly one connection, riding the connection's
 * shared tunnel.
 *
 * For the handful of operations that genuinely need consecutive statements to land on
 * the *same* physical connection because one configures the next — SQL Server's
 * `SET SHOWPLAN_XML` / `SET STATISTICS XML` are session-scoped, and a bare
 * `pool.request()` may run on any connection in the pool. A transaction would also pin
 * one connection, but SHOWPLAN mode compiles rather than executes the statements that
 * follow it, which is a bad interaction to build a COMMIT on top of.
 *
 * The tunnel is still shared, so this costs a TCP+auth handshake, not an SSH one.
 */
export async function withDedicatedMSSQLConnection<T>(
  config: ConnectionConfig,
  fn: (pool: sql.ConnectionPool) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  const overrides = entry.tunnel
    ? { host: entry.tunnel.localHost, port: entry.tunnel.localPort }
    : undefined
  const pool = new sql.ConnectionPool({
    ...toMSSQLConfig(config, overrides),
    pool: { max: 1, min: 0, idleTimeoutMillis: 1_000 }
  })
  pool.on('error', (err: Error) => {
    log.warn('dedicated connection error:', err.message)
  })
  // connect() inside the try: a rejected connection would otherwise skip the finally
  // and leak the pool object along with any socket it had already opened.
  try {
    await pool.connect()
    return await fn(pool)
  } finally {
    await pool.close().catch(() => {})
  }
}

/** Close the pool (and tunnel) for a single connection. */
export async function closeMSSQLPool(config: ConnectionConfig): Promise<void> {
  return registry.close(config)
}

/** Close every SQL Server pool. Call on app shutdown. */
export async function closeAllMSSQLPools(): Promise<void> {
  return registry.closeAll()
}
