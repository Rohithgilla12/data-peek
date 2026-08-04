import { createHash } from 'crypto'
import { types as pgTypes, Pool, type PoolClient } from 'pg'
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
 * A pool is keyed by *both* the connection it belongs to and the shape it was built
 * from, so a config that has been edited — new credentials, TLS settings, schema,
 * tunnel — always gets a fresh socket rather than a pool that predates the change.
 */

interface PoolEntry {
  pool: Pool
  tunnel: TunnelSession | null
}

const POOL_MAX = 5
const IDLE_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 15_000
// pool.end() blocks until every checked-out client is released, so an ad-hoc query
// stuck on a server-side lock (or a dead socket) would otherwise hang teardown
// indefinitely — leaving `shuttingDown` latched and every later acquisition failing
// with "Pool manager is shutting down". Bound each end() so teardown always completes.
const POOL_END_TIMEOUT_MS = 2_500

const pools = new Map<string, PoolEntry>()
// Tracks in-flight pool creation so concurrent first-use callers share one tunnel/pool.
const pendingPools = new Map<string, Promise<PoolEntry>>()
// identity -> most recently requested pool key, so a slow creation can detect that the
// connection's shape moved on while it was dialing. Entries are dropped on teardown.
const latestShape = new Map<string, string>()

let shuttingDown = false
let teardownInFlight: Promise<void> | null = null

/**
 * Hash the fields that decide what a physical connection *is*.
 *
 * Everything here is baked into the socket at startup — the TLS handshake, the
 * credentials, the `search_path` startup option, the tunnel it rides through — so a
 * pool built from one shape can never be handed to a caller asking for another. That
 * used to be exactly what happened when a *saved* connection was edited: pools keyed
 * on `config.id` alone meant ticking "Use SSL" and hitting Test Connection reused the
 * cached plaintext pool, and the server kept answering `no pg_hba.conf entry for host
 * ... no encryption` with the box checked (issue #252).
 */
function getShapeFingerprint(config: ConnectionConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user ?? '',
        password: config.password ?? '',
        schema: config.schema ?? '',
        ssl: config.ssl ? (config.sslOptions ?? {}) : false,
        ssh: config.ssh ? (config.sshConfig ?? null) : null
      })
    )
    .digest('hex')
    .slice(0, 16)
}

/**
 * Which connection a pool belongs to, independent of its current shape: the saved
 * connection's id, or the target itself for an ad-hoc config that was never saved.
 * Shape variants under one identity are collapsed to a single live pool.
 */
function getPoolIdentity(config: ConnectionConfig): string {
  if (config.id) return `pg:id:${config.id}`
  return `pg:adhoc:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

function getPoolKey(config: ConnectionConfig): string {
  return `${getPoolIdentity(config)}#${getShapeFingerprint(config)}`
}

/** Recover the identity half of a pool key. Fingerprints never contain `#`. */
function identityOf(key: string): string {
  return key.slice(0, key.lastIndexOf('#'))
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

    // Return timestamp (without tz) values as raw ISO strings so JavaScript's
    // Date auto-conversion doesn't shift UTC-stored timestamps to local time.
    // OID 1114 = timestamp, 1184 = timestamptz (timestamptz SHOULD be shifted).
    pgTypes.setTypeParser(1114, (val: string) => val)

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

/**
 * Retire pools that share `identity` but were built from a different shape.
 *
 * Runs on every acquisition, which is what keeps a connection down to one live pool
 * as its shape changes — otherwise each edited-and-tested variant would linger until
 * app shutdown. `pool.end()` drains its own checked-out clients, so a query still
 * running on the outgoing pool finishes; we don't wait for it because the caller is
 * waiting on a different pool entirely.
 *
 * Two shapes of one connection being used *concurrently* — a Test Connection on an
 * edited config while the saved one is being queried — therefore retire each other in
 * turn. That is accepted: both callers still talk to a pool matching their own config,
 * and a Test Connection is one `SELECT 1`, so the churn is a pool rebuild or two rather
 * than a sustained thrash.
 */
function evictOtherShapes(identity: string, keepKey: string): void {
  for (const [key, entry] of pools) {
    if (key === keepKey || identityOf(key) !== identity) continue
    pools.delete(key)
    log.debug('retiring pool built from a superseded connection shape')
    entry.pool.end().catch((err) => {
      log.warn('error ending superseded pool:', (err as Error).message)
    })
    closeTunnel(entry.tunnel)
  }
}

export async function getOrCreatePool(config: ConnectionConfig): Promise<PoolEntry> {
  if (shuttingDown) {
    throw new Error('Pool manager is shutting down')
  }
  const key = getPoolKey(config)
  const identity = identityOf(key)
  // Recorded before dialing so a creation that is still in flight can tell it has been
  // superseded: evictOtherShapes only sees installed pools, so without this a slow dial
  // (SSH tunnel setup widens the window considerably) would install a second live pool
  // and tunnel under one identity after a newer shape had already been installed.
  latestShape.set(identity, key)
  evictOtherShapes(identity, key)

  const existing = pools.get(key)
  if (existing) return existing

  const inflight = pendingPools.get(key)
  if (inflight) return inflight

  const promise = createPoolEntry(config, key)
    .then((entry) => {
      // Don't install the entry if a closePgPool/shutdown raced and decided to drop it,
      // or if a newer shape for this connection was acquired while we were dialing.
      if (shuttingDown || pendingPools.get(key) !== promise || latestShape.get(identity) !== key) {
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
  // Every shape variant goes, not just the one matching the config we were handed:
  // the caller passes the *pre-edit* config, while a Test Connection during that edit
  // may already have built a pool from the new shape.
  const identity = getPoolIdentity(config)
  // Also makes any in-flight creation for this connection self-dispose instead of
  // installing itself after we have finished tearing down.
  latestShape.delete(identity)

  for (const [key, promise] of pendingPools) {
    if (identityOf(key) !== identity) continue
    pendingPools.delete(key)
    // The .then in getOrCreatePool checks pendingPools identity and self-disposes.
    await promise.catch(() => {})
  }

  const entries = Array.from(pools.keys())
    .filter((key) => identityOf(key) === identity)
    .map((key) => evictPoolEntry(key))

  for (const entry of entries) {
    if (!entry) continue
    try {
      await entry.pool.end()
    } catch (err) {
      log.warn('error ending pool:', (err as Error).message)
    }
    closeTunnel(entry.tunnel)
  }
}

/**
 * Close every pool. Call on app shutdown.
 *
 * `shuttingDown` is a *transient* guard, not a permanent latch: it blocks new
 * pool creation only while teardown is in flight (so a pool created mid-teardown
 * can't be orphaned by the snapshot below), then clears. This matters on macOS,
 * where the process routinely outlives a cleanup pass — the last window hides
 * instead of quitting, and a raced/aborted quit (e.g. an auto-update
 * `quitAndInstall` whose quit is preventDefault-ed) can run this without the
 * process dying. If the flag stayed latched, every later pool acquisition would
 * fail with "Pool manager is shutting down" until relaunch.
 */
// Await pool.end() but never longer than POOL_END_TIMEOUT_MS. A stuck client keeps
// end() pending forever; letting teardown move on unblocks the manager's state reset
// (the pg socket handle is the OS's to clean up on exit).
async function endPoolBounded(pool: Pool): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      pool.end(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, POOL_END_TIMEOUT_MS)
        timer.unref?.()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function closeAllPgPools(): Promise<void> {
  // Coalesce concurrent calls onto one teardown, so a second call's `finally`
  // can't flip `shuttingDown` back to false while the first is still tearing down.
  if (teardownInFlight) return teardownInFlight
  shuttingDown = true
  teardownInFlight = (async () => {
    try {
      // Let in-flight pool creations settle first. Each resolves through
      // getOrCreatePool's post-create check, which ends the pool and closes its
      // tunnel while `shuttingDown` is true — so awaiting them here tears them
      // down too instead of leaking a half-created pool + tunnel. New creations
      // can't start during teardown (the guard above rejects them).
      await Promise.allSettled(Array.from(pendingPools.values()))
      const entries = Array.from(pools.values())
      pools.clear()
      latestShape.clear()
      await Promise.all(
        entries.map(async (entry) => {
          try {
            await endPoolBounded(entry.pool)
          } catch (err) {
            log.warn('error ending pool:', (err as Error).message)
          }
          closeTunnel(entry.tunnel)
        })
      )
    } finally {
      shuttingDown = false
      teardownInFlight = null
    }
  })()
  return teardownInFlight
}
