import { createHash } from 'crypto'
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

let shuttingDown = false

function getPoolKey(config: ConnectionConfig): string {
  if (config.id) return `pg:${config.id}`
  // Unsaved configs (test-connect before save) hash the auth+tunnel+ssl shape so
  // two attempts to the same host with different credentials/keys can't share a pool.
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        password: config.password ?? '',
        ssh: config.ssh ? (config.sshConfig ?? null) : null,
        ssl: config.ssl ? (config.sslOptions ?? null) : null
      })
    )
    .digest('hex')
    .slice(0, 16)
  return `pg:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}:${fingerprint}`
}

async function createPoolEntry(config: ConnectionConfig, key: string): Promise<PoolEntry> {
  let tunnel: TunnelSession | null = null
  if (config.ssh) {
    tunnel = await createTunnel(config)
  }
  try {
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

    // If the SSH tunnel dies (server restart, network blip), evict the pool entry
    // so the next withPgClient call rebuilds tunnel+pool instead of dialing a dead port.
    if (tunnel?.ssh) {
      tunnel.ssh.once('close', () => {
        const current = pools.get(key)
        if (current && current.tunnel === tunnel) {
          pools.delete(key)
          current.pool.end().catch(() => {})
        }
      })
    }

    return { pool, tunnel }
  } catch (err) {
    closeTunnel(tunnel)
    throw err
  }
}

async function getOrCreatePool(config: ConnectionConfig): Promise<PoolEntry> {
  if (shuttingDown) {
    throw new Error('Pool manager is shutting down')
  }
  const key = getPoolKey(config)
  const existing = pools.get(key)
  if (existing) return existing

  const inflight = pendingPools.get(key)
  if (inflight) return inflight

  const promise = createPoolEntry(config, key)
    .then((entry) => {
      // Don't install the entry if a closePgPool/shutdown raced and decided to drop it.
      if (shuttingDown || pendingPools.get(key) !== promise) {
        entry.pool.end().catch(() => {})
        closeTunnel(entry.tunnel)
        throw new Error('Pool was closed before initialization completed')
      }
      pools.set(key, entry)
      return entry
    })
    .finally(() => {
      if (pendingPools.get(key) === promise) {
        pendingPools.delete(key)
      }
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
 * Drop the in-memory pool entry without ending the underlying pg.Pool.
 * Used by callers that have already destroyed the pool out-of-band.
 */
function evictPoolEntry(key: string): PoolEntry | undefined {
  const entry = pools.get(key)
  if (!entry) return undefined
  pools.delete(key)
  return entry
}

/**
 * Close the pool (and its tunnel) for a single connection. Call when the
 * connection is updated or deleted so subsequent queries pick up the new
 * shape. Awaits any in-flight pool creation so we don't leak an entry that
 * appears after this returns.
 */
export async function closePgPool(config: ConnectionConfig): Promise<void> {
  const key = getPoolKey(config)
  const inflight = pendingPools.get(key)
  if (inflight) {
    pendingPools.delete(key)
    // The .then in getOrCreatePool checks pendingPools identity and self-disposes.
    await inflight.catch(() => {})
  }
  const entry = evictPoolEntry(key)
  if (!entry) return
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
  shuttingDown = true
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
