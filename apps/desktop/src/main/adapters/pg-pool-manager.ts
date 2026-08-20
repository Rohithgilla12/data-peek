import { Pool, type ClientConfig, type PoolClient } from 'pg'
import type { ConnectionConfig } from '@shared/index'
import { createLogger } from '../lib/logger'
import { buildClientConfig, registerPgTypeParsers } from './pg-client-config'
import { PoolRegistry, poolIdentity } from './pool-registry'

const log = createLogger('pg-pool')

/**
 * Connection pooling for Postgres.
 *
 * Each saved connection gets one pg.Pool plus (optionally) one SSH tunnel that the
 * pool's clients share, plus a second pool built lazily for manual transactions. The
 * keying, tunnel sharing, shape-change rebuild and teardown all come from
 * `PoolRegistry`, which the MySQL and SQL Server managers share.
 */

const POOL_MAX = 5
// Manual transactions get their own budget rather than eating into POOL_MAX.
const SESSION_POOL_MAX = 4
const IDLE_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 15_000

interface PgPools {
  pool: Pool
  /**
   * Second pool, built lazily from the same client config and riding the same tunnel,
   * that serves only manual (`BEGIN`-and-hold) transaction sessions. See
   * `acquirePgSessionClient` for why these can't come out of `pool`.
   */
  sessionPool: Pool | null
  /** Client config `sessionPool` is built from, kept so creation stays synchronous. */
  clientConfig: ClientConfig
  /** Session clients currently checked out of `sessionPool` and held open. */
  parkedSessions: number
}

const registry = new PoolRegistry<PgPools>({
  driver: 'pg',
  // search_path is pinned via startup options, so a pool built for one schema can never
  // be handed to a caller asking for another.
  fingerprintExtras: (config) => ({ schema: config.schema ?? '' }),
  create: (config, overrides) => {
    const clientConfig = buildClientConfig(config, overrides)
    const pool = new Pool({
      ...clientConfig,
      max: POOL_MAX,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS
    })

    registerPgTypeParsers()

    // pg.Pool emits 'error' for idle clients that die between checkouts (e.g. server-side
    // timeout). Without a listener the process crashes on unhandled error.
    pool.on('error', (err) => {
      log.warn('idle client error:', err.message)
    })

    return { pool, sessionPool: null, clientConfig, parkedSessions: 0 }
  },
  destroy: async (pools) => {
    await Promise.all([pools.pool.end(), pools.sessionPool ? pools.sessionPool.end() : undefined])
  }
})

/**
 * Build (once) the pool that backs manual transaction sessions.
 *
 * `new Pool()` doesn't dial — pg connects lazily on first checkout — so this stays
 * synchronous and two concurrent `beginTransaction` calls can't race into building
 * two pools.
 */
function ensureSessionPool(pools: PgPools): Pool {
  if (pools.sessionPool) return pools.sessionPool
  const sessionPool = new Pool({
    ...pools.clientConfig,
    max: SESSION_POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS
  })
  sessionPool.on('error', (err) => {
    log.warn('idle session client error:', err.message)
  })
  pools.sessionPool = sessionPool
  return sessionPool
}

/**
 * Acquire a pooled client, run `fn`, and release the client.
 *
 * The client is always released back to the pool, even if `fn` throws. If the caller
 * needs the connection torn down (e.g. after a cancelled query left it in an unknown
 * state) it can call `client.release(true)` itself.
 */
export async function withPgClient<T>(
  config: ConnectionConfig,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  const client = await entry.pool.pool.connect()
  try {
    return await fn(client)
  } finally {
    // Cancellation paths may have already destroyed this client via release(true).
    // pg-pool throws on double-release, so swallow.
    try {
      client.release()
    } catch {
      // already released
    }
  }
}

/**
 * Which connection a pool belongs to, for callers bucketing their own per-connection
 * state (parked transaction sessions) the same way the registry buckets pools.
 */
export function pgPoolIdentity(config: ConnectionConfig): string {
  return poolIdentity('pg', config)
}

/**
 * A session client checked out of the session pool, plus the one call that returns it.
 * `release` is idempotent, so a cancellation path that already destroyed the client
 * doesn't have to coordinate with the owner.
 */
export interface PgSessionLease {
  client: PoolClient
  /** Return the client. Pass `true` to destroy it instead of recycling it. */
  release(destroy?: boolean): void
}

/**
 * Check out a client to hold open for a manual (`BEGIN`-and-hold) transaction.
 *
 * These come from a *separate* pool. A manual transaction parks its client for as long
 * as the user leaves the transaction open, so serving them from the main pool meant
 * POOL_MAX open transactions could consume every slot — after which every ordinary
 * query on that connection (including background work like schema refresh) blocked on
 * `pool.connect()` and failed after CONNECT_TIMEOUT_MS with pg's generic
 * "timeout exceeded when trying to connect".
 *
 * Saturating the session pool is now a local failure with an actionable message, and
 * ad-hoc queries keep all POOL_MAX of their own slots regardless.
 */
export async function acquirePgSessionClient(config: ConnectionConfig): Promise<PgSessionLease> {
  const entry = await registry.getOrCreate(config)
  const pools = entry.pool
  // Checked up front rather than letting pool.connect() queue, so the caller gets a
  // reason instead of a 15-second wait ending in a connection-timeout error.
  if (pools.parkedSessions >= SESSION_POOL_MAX) {
    throw new Error(
      `This connection already has ${SESSION_POOL_MAX} open transactions, which is the maximum. ` +
        `Commit or roll one back before starting another.`
    )
  }

  const sessionPool = ensureSessionPool(pools)
  // Reserved before the await so concurrent acquisitions can't both pass the check above.
  pools.parkedSessions++
  let client: PoolClient
  try {
    client = await sessionPool.connect()
  } catch (err) {
    pools.parkedSessions--
    throw err
  }

  let released = false
  return {
    client,
    release(destroy?: boolean) {
      if (released) return
      released = true
      pools.parkedSessions--
      try {
        client.release(destroy)
      } catch {
        // Cancellation paths may have already destroyed this client.
      }
    }
  }
}

/**
 * Acquire a pooled client, BEGIN, run `fn`, then COMMIT (or ROLLBACK on failure).
 */
export async function withPgTransaction<T>(
  config: ConnectionConfig,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  const client = await entry.pool.pool.connect()
  let poisoned = false
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      // Connection is in an unknown protocol state; mark it for destruction so the
      // pool doesn't hand the next caller a client mid-transaction.
      poisoned = true
      log.warn('rollback failed:', (rollbackErr as Error).message)
    }
    throw error
  } finally {
    try {
      client.release(poisoned ? true : undefined)
    } catch {
      // already released
    }
  }
}

/**
 * Close the pool (and its tunnel) for a single connection. Call when the connection is
 * updated or deleted so subsequent queries pick up the new shape.
 */
export async function closePgPool(config: ConnectionConfig): Promise<void> {
  return registry.close(config)
}

/** Close every Postgres pool. Call on app shutdown. */
export async function closeAllPgPools(): Promise<void> {
  return registry.closeAll()
}
