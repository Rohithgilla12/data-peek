import { createHash } from 'crypto'
import type { ConnectionConfig } from '@shared/index'
import { closeTunnel, createTunnel, type TunnelSession } from '../ssh-tunnel-service'
import { createLogger } from '../lib/logger'

/**
 * Driver-agnostic connection-pool lifecycle.
 *
 * Every supported database needs the same things around its pool: one pool per saved
 * connection, an SSH tunnel the pool's sockets share, a rebuild when the connection's
 * shape changes, and a teardown that can't wedge. That logic was written once for
 * Postgres; this is it lifted out so MySQL and SQL Server get the same guarantees
 * instead of their own partial re-derivations.
 *
 * `TPool` is whatever handle the driver pools with — a `pg.Pool`, a `mysql2` pool, an
 * `mssql.ConnectionPool`, or a composite when a driver needs more than one (Postgres
 * carries a second pool for held-open transactions).
 */

export interface PoolEntry<TPool> {
  pool: TPool
  tunnel: TunnelSession | null
}

export interface PoolRegistryOptions<TPool> {
  /** Namespaces pool keys so two drivers can't collide on one connection id. */
  driver: string
  /**
   * Driver-specific config that changes what the physical connection *is* and so must
   * force a new pool when it changes (TLS options, driver flags, auth mode).
   */
  fingerprintExtras?(config: ConnectionConfig): unknown
  /**
   * Build the driver's pool. `overrides` carries the local tunnel endpoint when the
   * connection rides SSH. Never called concurrently for the same key.
   */
  create(
    config: ConnectionConfig,
    overrides: { host: string; port: number } | undefined
  ): Promise<TPool> | TPool
  /** Tear the pool down. Called at most once per created pool. */
  destroy(pool: TPool): Promise<void>
}

/** Bound every destroy() so one stuck client can't leave the registry mid-teardown. */
const POOL_END_TIMEOUT_MS = 2_500

/**
 * Which connection a pool belongs to, independent of its current shape: the saved
 * connection's id, or the target itself for an ad-hoc config that was never saved.
 * Shape variants under one identity are collapsed to a single live pool.
 *
 * Exported so callers holding per-connection state of their own — parked transaction
 * sessions, for instance — can bucket it the same way the registry buckets pools.
 */
export function poolIdentity(driver: string, config: ConnectionConfig): string {
  if (config.id) return `${driver}:id:${config.id}`
  return `${driver}:adhoc:${config.host}:${config.port}:${config.database}:${config.user ?? 'default'}`
}

export class PoolRegistry<TPool> {
  private readonly log
  private readonly pools = new Map<string, PoolEntry<TPool>>()
  /** In-flight creation, so concurrent first-use callers share one tunnel and pool. */
  private readonly pendingPools = new Map<string, Promise<PoolEntry<TPool>>>()
  /**
   * identity -> most recently requested key, so a slow dial can detect that the
   * connection's shape moved on while it was connecting.
   */
  private readonly latestShape = new Map<string, string>()

  private shuttingDown = false
  private teardownInFlight: Promise<void> | null = null

  constructor(private readonly options: PoolRegistryOptions<TPool>) {
    this.log = createLogger(`${options.driver}-pool`)
  }

  /**
   * Hash the fields that decide what a physical connection *is*.
   *
   * Everything here is baked into the socket at startup — the TLS handshake, the
   * credentials, the tunnel it rides through — so a pool built from one shape can never
   * be handed to a caller asking for another. That used to be exactly what happened when
   * a *saved* connection was edited: pools keyed on `config.id` alone meant ticking
   * "Use SSL" and hitting Test Connection reused the cached plaintext pool (issue #252).
   */
  private shapeFingerprint(config: ConnectionConfig): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user ?? '',
          password: config.password ?? '',
          ssl: config.ssl ? (config.sslOptions ?? {}) : false,
          ssh: config.ssh ? (config.sshConfig ?? null) : null,
          extras: this.options.fingerprintExtras?.(config) ?? null
        })
      )
      .digest('hex')
      .slice(0, 16)
  }

  private identity(config: ConnectionConfig): string {
    return poolIdentity(this.options.driver, config)
  }

  private key(config: ConnectionConfig): string {
    return `${this.identity(config)}#${this.shapeFingerprint(config)}`
  }

  /** Recover the identity half of a pool key. Fingerprints never contain `#`. */
  private identityOf(key: string): string {
    return key.slice(0, key.lastIndexOf('#'))
  }

  private async createEntry(config: ConnectionConfig, key: string): Promise<PoolEntry<TPool>> {
    let tunnel: TunnelSession | null = null
    if (config.ssh) {
      tunnel = await createTunnel(config)
    }
    try {
      const overrides = tunnel ? { host: tunnel.localHost, port: tunnel.localPort } : undefined
      const pool = await this.options.create(config, overrides)

      // If the SSH tunnel dies (server restart, network blip), evict the entry so the
      // next acquisition rebuilds tunnel+pool instead of dialing a dead local port.
      if (tunnel?.ssh) {
        tunnel.ssh.once('close', () => {
          const current = this.pools.get(key)
          if (current && current.tunnel === tunnel) {
            this.pools.delete(key)
            this.options.destroy(current.pool).catch(() => {})
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
   * app shutdown. We don't await the teardown because the caller is waiting on a
   * different pool entirely; a query still running on the outgoing pool drains itself.
   */
  private evictOtherShapes(identity: string, keepKey: string): void {
    for (const [key, entry] of this.pools) {
      if (key === keepKey || this.identityOf(key) !== identity) continue
      this.pools.delete(key)
      this.log.debug('retiring pool built from a superseded connection shape')
      this.options.destroy(entry.pool).catch((err) => {
        this.log.warn('error ending superseded pool:', (err as Error).message)
      })
      closeTunnel(entry.tunnel)
    }
  }

  async getOrCreate(config: ConnectionConfig): Promise<PoolEntry<TPool>> {
    if (this.shuttingDown) {
      throw new Error('Pool manager is shutting down')
    }
    const key = this.key(config)
    const identity = this.identityOf(key)
    // Recorded before dialing so a creation still in flight can tell it has been
    // superseded: evictOtherShapes only sees installed pools, so without this a slow
    // dial (SSH tunnel setup widens the window considerably) would install a second
    // live pool and tunnel under one identity after a newer shape was already in place.
    this.latestShape.set(identity, key)
    this.evictOtherShapes(identity, key)

    const existing = this.pools.get(key)
    if (existing) return existing

    const inflight = this.pendingPools.get(key)
    if (inflight) return inflight

    const promise = this.createEntry(config, key)
      .then((entry) => {
        // Don't install if a close()/closeAll() raced and decided to drop this, or if a
        // newer shape for this connection was acquired while we were dialing.
        if (
          this.shuttingDown ||
          this.pendingPools.get(key) !== promise ||
          this.latestShape.get(identity) !== key
        ) {
          this.options.destroy(entry.pool).catch(() => {})
          closeTunnel(entry.tunnel)
          throw new Error('Pool was closed before initialization completed')
        }
        this.pools.set(key, entry)
        return entry
      })
      .finally(() => {
        if (this.pendingPools.get(key) === promise) {
          this.pendingPools.delete(key)
        }
      })

    this.pendingPools.set(key, promise)
    return promise
  }

  /**
   * Close the pool (and its tunnel) for a single connection. Call when the connection is
   * updated or deleted so subsequent queries pick up the new shape. Awaits any in-flight
   * creation so we don't leak an entry that appears after this returns.
   */
  async close(config: ConnectionConfig): Promise<void> {
    // Every shape variant goes, not just the one matching the config we were handed: the
    // caller passes the *pre-edit* config, while a Test Connection during that edit may
    // already have built a pool from the new shape.
    const identity = this.identity(config)
    // Also makes any in-flight creation self-dispose instead of installing itself after
    // we have finished tearing down.
    this.latestShape.delete(identity)

    for (const [key, promise] of this.pendingPools) {
      if (this.identityOf(key) !== identity) continue
      this.pendingPools.delete(key)
      // getOrCreate's .then checks pendingPools identity and self-disposes.
      await promise.catch(() => {})
    }

    const entries: PoolEntry<TPool>[] = []
    for (const key of Array.from(this.pools.keys())) {
      if (this.identityOf(key) !== identity) continue
      const entry = this.pools.get(key)
      this.pools.delete(key)
      if (entry) entries.push(entry)
    }

    for (const entry of entries) {
      try {
        // Bounded, like closeAll(): closeTunnel below runs *after* this, so an
        // unbounded destroy that never settles (a checked-out client that never
        // releases) would strand the SSH tunnel and its bound local port for the rest
        // of the session.
        await this.destroyBounded(entry.pool)
      } catch (err) {
        this.log.warn('error ending pool:', (err as Error).message)
      }
      closeTunnel(entry.tunnel)
    }
  }

  /** Await destroy() but never longer than POOL_END_TIMEOUT_MS. */
  private async destroyBounded(pool: TPool): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.options.destroy(pool),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, POOL_END_TIMEOUT_MS)
          timer.unref?.()
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Close every pool. Call on app shutdown.
   *
   * `shuttingDown` is a *transient* guard, not a permanent latch: it blocks new pool
   * creation only while teardown is in flight (so a pool created mid-teardown can't be
   * orphaned by the snapshot below), then clears. This matters on macOS, where the
   * process routinely outlives a cleanup pass — the last window hides instead of
   * quitting, and a raced/aborted quit (e.g. an auto-update `quitAndInstall` whose quit
   * is preventDefault-ed) can run this without the process dying. If the flag stayed
   * latched, every later acquisition would fail with "Pool manager is shutting down"
   * until relaunch.
   */
  async closeAll(): Promise<void> {
    // Coalesce concurrent calls onto one teardown, so a second call's `finally` can't
    // flip `shuttingDown` back to false while the first is still tearing down.
    if (this.teardownInFlight) return this.teardownInFlight
    this.shuttingDown = true
    this.teardownInFlight = (async () => {
      try {
        // Let in-flight creations settle first. Each resolves through getOrCreate's
        // post-create check, which destroys the pool and closes its tunnel while
        // `shuttingDown` is true — so awaiting them here tears them down too instead of
        // leaking a half-created pool + tunnel. New creations can't start during
        // teardown (the guard in getOrCreate rejects them).
        await Promise.allSettled(Array.from(this.pendingPools.values()))
        const entries = Array.from(this.pools.values())
        this.pools.clear()
        this.latestShape.clear()
        await Promise.all(
          entries.map(async (entry) => {
            try {
              await this.destroyBounded(entry.pool)
            } catch (err) {
              this.log.warn('error ending pool:', (err as Error).message)
            }
            closeTunnel(entry.tunnel)
          })
        )
      } finally {
        this.shuttingDown = false
        this.teardownInFlight = null
      }
    })()
    return this.teardownInFlight
  }
}
