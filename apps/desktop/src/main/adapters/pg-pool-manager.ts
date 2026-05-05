import { Pool, type PoolClient } from 'pg'
import type { ConnectionConfig } from '@shared/index'
import { closeTunnel, createTunnel, type TunnelSession } from '../ssh-tunnel-service'
import { createLogger } from '../lib/logger'
import { buildClientConfig } from './pg-client-config'

const log = createLogger('pg-pool')

/**
 * Connection pooling for Postgres.
 *
 * Each saved connection gets one pg.Pool plus (optionally) one SSH tunnel that
 * the pool's clients share. Pools are created lazily on first use and torn
 * down via `closePgPool` when the connection is edited/deleted.
 *
 * Adapter methods that previously did `new Client(...) → connect → query → end`
 * per call now go through `withPgClient`, so per-query TCP/TLS/auth handshake
 * cost is paid once instead of on every request.
 */

interface PoolEntry {
  pool: Pool
  tunnel: TunnelSession | null
}

const POOL_MAX = 5
const IDLE_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 15_000

const pools = new Map<string, PoolEntry>()
// Tracks in-flight pool creation so concurrent first-use callers share one tunnel/pool.
const pendingPools = new Map<string, Promise<PoolEntry>>()

function getPoolKey(config: ConnectionConfig): string {
  if (config.id) return `pg:${config.id}`
  // Unsaved configs (e.g. test-connect before save) fall back to a shape-based key.
  return `pg:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

async function createPoolEntry(config: ConnectionConfig): Promise<PoolEntry> {
  let tunnel: TunnelSession | null = null
  if (config.ssh) {
    tunnel = await createTunnel(config)
  }
  const overrides = tunnel ? { host: tunnel.localHost, port: tunnel.localPort } : undefined
  const clientConfig = buildClientConfig(config, overrides)

  const pool = new Pool({
    ...clientConfig,
    max: POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS
  })

  // pg.Pool emits 'error' for idle clients that die between checkouts (e.g. server-side
  // timeout). Without a listener the process crashes on unhandled error.
  pool.on('error', (err) => {
    log.warn('idle client error:', err.message)
  })

  return { pool, tunnel }
}

async function getOrCreatePool(config: ConnectionConfig): Promise<PoolEntry> {
  const key = getPoolKey(config)
  const existing = pools.get(key)
  if (existing) return existing

  const inflight = pendingPools.get(key)
  if (inflight) return inflight

  const promise = createPoolEntry(config)
    .then((entry) => {
      pools.set(key, entry)
      return entry
    })
    .finally(() => {
      pendingPools.delete(key)
    })

  pendingPools.set(key, promise)
  return promise
}

/**
 * Acquire a pooled client, run `fn`, and release the client.
 *
 * The client is always released back to the pool, even if `fn` throws. If the
 * caller needs the connection torn down (e.g. after a cancelled query left it
 * in an unknown state) it can call `client.release(true)` itself.
 */
export async function withPgClient<T>(
  config: ConnectionConfig,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const entry = await getOrCreatePool(config)
  const client = await entry.pool.connect()
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
 * Acquire a pooled client, BEGIN, run `fn`, then COMMIT (or ROLLBACK on failure).
 */
export async function withPgTransaction<T>(
  config: ConnectionConfig,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const entry = await getOrCreatePool(config)
  const client = await entry.pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      log.warn('rollback failed:', (rollbackErr as Error).message)
    })
    throw error
  } finally {
    try {
      client.release()
    } catch {
      // already released
    }
  }
}

/**
 * Close the pool (and its tunnel) for a single connection. Call when the
 * connection is updated or deleted so subsequent queries pick up the new
 * shape.
 */
export async function closePgPool(config: ConnectionConfig): Promise<void> {
  const key = getPoolKey(config)
  const entry = pools.get(key)
  if (!entry) return
  pools.delete(key)
  try {
    await entry.pool.end()
  } catch (err) {
    log.warn('error ending pool:', (err as Error).message)
  }
  closeTunnel(entry.tunnel)
}

/**
 * Close every pool. Call on app shutdown.
 */
export async function closeAllPgPools(): Promise<void> {
  const entries = Array.from(pools.values())
  pools.clear()
  await Promise.all(
    entries.map(async (entry) => {
      try {
        await entry.pool.end()
      } catch (err) {
        log.warn('error ending pool:', (err as Error).message)
      }
      closeTunnel(entry.tunnel)
    })
  )
}
