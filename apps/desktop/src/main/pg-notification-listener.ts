import { randomUUID } from 'crypto'
import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type {
  ConnectionConfig,
  PgNotificationEvent,
  PgNotificationChannel,
  PgNotificationConnectionStatus,
  PgNotificationConnectionState
} from '@shared/index'
import { getAdapter, type DatabaseAdapter, type NotificationClient } from './db-adapter'
import { createLogger } from './lib/logger'

const log = createLogger('pg-notification-listener')

const MAX_EVENTS_PER_CONNECTION = 10000
const MAX_BACKOFF_MS = 30_000

/**
 * The factory for the long-lived connection a listener parks on.
 *
 * LISTEN registers against one backend session, so this connection can't come out of
 * the pool. The adapter owns building it — SSL, SSH tunnel, `search_path` — so a
 * listener connects exactly the way a query does.
 *
 * Callers resolve this *before* entering the reconnect loop: an adapter that doesn't
 * speak LISTEN/NOTIFY is a permanent failure, and feeding it to the backoff ladder
 * would spin forever instead of telling the user.
 */
function requireNotificationSupport(
  config: ConnectionConfig
): NonNullable<DatabaseAdapter['createNotificationClient']> {
  const adapter = getAdapter(config)
  const create = adapter.createNotificationClient
  if (!create) {
    throw new Error(`LISTEN/NOTIFY is not supported for ${adapter.dbType} connections`)
  }
  return create.bind(adapter)
}

/**
 * One connection attempt: the client it opened and the channels it carries.
 *
 * `destroyed` means "this attempt is retired, ignore its callbacks". It deliberately
 * says nothing about whether the *connection* should keep retrying — that used to be
 * conflated, and retiring a failed attempt silently switched off its own recovery.
 */
interface ListenerEntry {
  client: NotificationClient
  channels: Set<string>
  connectedSince: number
  destroyed: boolean
  config: ConnectionConfig
  status: PgNotificationConnectionStatus
}

const statuses = new Map<string, PgNotificationConnectionStatus>()

function setStatus(
  connectionId: string,
  patch: Partial<PgNotificationConnectionStatus> & { state: PgNotificationConnectionState }
): PgNotificationConnectionStatus {
  const existing = statuses.get(connectionId) ?? {
    connectionId,
    state: 'idle' as PgNotificationConnectionState,
    retryAttempt: 0
  }
  const next: PgNotificationConnectionStatus = { ...existing, ...patch, connectionId }
  statuses.set(connectionId, next)
  const entry = listeners.get(connectionId)
  if (entry) entry.status = next
  broadcastStatus(next)
  return next
}

function broadcastStatus(status: PgNotificationConnectionStatus): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send('pg-notify:status', status)
    }
  })
}

export function getStatus(connectionId: string): PgNotificationConnectionStatus | null {
  return statuses.get(connectionId) ?? null
}

export function getAllStatuses(): PgNotificationConnectionStatus[] {
  return Array.from(statuses.values())
}

let sqliteDb: Database.Database | null = null

function getDb(): Database.Database {
  if (sqliteDb) return sqliteDb

  const dbPath = join(app.getPath('userData'), 'pg-notifications.db')
  sqliteDb = new Database(dbPath)

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS pg_notification_events (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      payload TEXT NOT NULL,
      received_at INTEGER NOT NULL
    )
  `)

  sqliteDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_pne_connection_received
    ON pg_notification_events (connection_id, received_at DESC)
  `)

  return sqliteDb
}

const listeners = new Map<string, ListenerEntry>()

/**
 * Pending reconnect timers, held per connection rather than on the entry.
 *
 * An entry is one attempt and dies with it; recovery outlives any single attempt, so a
 * timer parked on the entry was unreachable exactly when it mattered — after a failed
 * dial, when there is no live entry to hang it from.
 */
const pendingReconnects = new Map<string, ReturnType<typeof setTimeout>>()

function clearPendingReconnect(connectionId: string): void {
  const timer = pendingReconnects.get(connectionId)
  if (!timer) return
  clearTimeout(timer)
  pendingReconnects.delete(connectionId)
}

/**
 * Connections torn down for good, so a timer that fires during shutdown can't dial a
 * connection the app has finished with.
 */
const abandoned = new Set<string>()

async function connectListener(
  connectionId: string,
  config: ConnectionConfig,
  channels: Set<string>,
  backoffMs = 1000
): Promise<void> {
  abandoned.delete(connectionId)
  clearPendingReconnect(connectionId)

  const existing = listeners.get(connectionId)
  if (existing) {
    existing.destroyed = true
    // Removed, not left as a tombstone: a retired entry that stays in the map makes
    // subscribe() think there is a live listener to add a channel to.
    listeners.delete(connectionId)
    await existing.client.close().catch((err) => {
      log.warn(`Failed to close the previous listener client for ${connectionId}:`, err)
    })
  }

  const prior = statuses.get(connectionId)
  setStatus(connectionId, {
    state: prior && prior.state !== 'idle' ? 'reconnecting' : 'connecting',
    nextRetryAt: undefined,
    backoffMs: undefined
  })

  let client: NotificationClient | null = null
  try {
    client = await requireNotificationSupport(config)(config)

    const entry: ListenerEntry = {
      client,
      channels: new Set(channels),
      connectedSince: Date.now(),
      destroyed: false,
      config,
      status: statuses.get(connectionId)!
    }
    listeners.set(connectionId, entry)

    client.onNotification((channel, payload) => {
      // A retired client whose close() failed can still be delivering; without this its
      // events would be persisted and broadcast alongside its replacement's.
      if (entry.destroyed) return
      const event: PgNotificationEvent = {
        id: randomUUID(),
        connectionId,
        channel,
        payload,
        receivedAt: Date.now()
      }

      persistEvent(event)
      broadcastEvent(event)
    })

    client.onDisconnect((err) => {
      if (entry.destroyed) return
      if (err) {
        log.error(`pg notification client error for ${connectionId}:`, err)
        setStatus(connectionId, { state: 'error', lastError: err.message })
      } else {
        log.warn(`pg notification client disconnected for ${connectionId}, reconnecting...`)
        setStatus(connectionId, { state: 'disconnected' })
      }
      scheduleReconnect(connectionId, config, entry.channels, backoffMs)
    })

    for (const channel of channels) {
      await client.query(`LISTEN ${quoteIdent(channel)}`)
      log.debug(`Listening on channel "${channel}" for connection ${connectionId}`)
    }

    setStatus(connectionId, {
      state: 'connected',
      connectedSince: Date.now(),
      retryAttempt: 0,
      lastError: undefined,
      nextRetryAt: undefined,
      backoffMs: undefined
    })
  } catch (err) {
    log.error(`Failed to connect listener for ${connectionId}:`, err)
    // A LISTEN that failed after the dial succeeded leaves a live connection behind, so
    // this attempt has to be retired and closed. Retiring it must not disarm the retry
    // below, which is why `destroyed` no longer gates scheduleReconnect.
    const entry = listeners.get(connectionId)
    const retryChannels = entry?.client === client ? entry.channels : channels
    if (entry && entry.client === client) {
      entry.destroyed = true
      listeners.delete(connectionId)
    }
    await client?.close().catch((closeErr) => {
      log.warn(`Failed to close the half-built listener client for ${connectionId}:`, closeErr)
    })
    setStatus(connectionId, {
      state: 'error',
      lastError: err instanceof Error ? err.message : String(err)
    })
    scheduleReconnect(connectionId, config, retryChannels, backoffMs)
  }
}

function scheduleReconnect(
  connectionId: string,
  config: ConnectionConfig,
  channels: Set<string>,
  backoffMs: number
): void {
  if (abandoned.has(connectionId)) return

  const nextBackoff = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
  const nextRetryAt = Date.now() + backoffMs
  log.debug(`Reconnecting ${connectionId} in ${backoffMs}ms`)

  const prior = statuses.get(connectionId)
  setStatus(connectionId, {
    state: 'reconnecting',
    retryAttempt: (prior?.retryAttempt ?? 0) + 1,
    nextRetryAt,
    backoffMs
  })

  // At most one timer per connection: a socket death that reaches both the disconnect
  // handler and a rejected query would otherwise arm two.
  clearPendingReconnect(connectionId)

  const timer = setTimeout(() => {
    pendingReconnects.delete(connectionId)
    if (abandoned.has(connectionId)) return
    connectListener(connectionId, config, channels, nextBackoff)
  }, backoffMs)

  pendingReconnects.set(connectionId, timer)
}

export async function forceReconnect(connectionId: string): Promise<void> {
  const entry = listeners.get(connectionId)
  if (!entry) {
    throw new Error('No listener registered for this connection')
  }
  clearPendingReconnect(connectionId)
  log.debug(`Force-reconnecting ${connectionId}`)
  await connectListener(connectionId, entry.config, new Set(entry.channels), 1000)
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function persistEvent(event: PgNotificationEvent): void {
  try {
    const db = getDb()
    db.prepare(
      'INSERT OR IGNORE INTO pg_notification_events (id, connection_id, channel, payload, received_at) VALUES (?, ?, ?, ?, ?)'
    ).run(event.id, event.connectionId, event.channel, event.payload, event.receivedAt)

    const count = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM pg_notification_events WHERE connection_id = ?')
        .get(event.connectionId) as { cnt: number }
    ).cnt

    if (count > MAX_EVENTS_PER_CONNECTION) {
      const excess = count - MAX_EVENTS_PER_CONNECTION
      db.prepare(
        `
        DELETE FROM pg_notification_events
        WHERE id IN (
          SELECT id FROM pg_notification_events
          WHERE connection_id = ?
          ORDER BY received_at ASC
          LIMIT ?
        )
      `
      ).run(event.connectionId, excess)
    }
  } catch (err) {
    log.error('Failed to persist notification event:', err)
  }
}

function broadcastEvent(event: PgNotificationEvent): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send('pg-notify:event', event)
    }
  })
}

export async function subscribe(
  connectionId: string,
  config: ConnectionConfig,
  channel: string
): Promise<void> {
  // Up front, so an unsupported driver rejects the IPC call instead of disappearing
  // into connectListener's catch and retrying on a ladder that can never succeed.
  requireNotificationSupport(config)

  const existing = listeners.get(connectionId)

  if (existing && !existing.destroyed) {
    if (!existing.channels.has(channel)) {
      existing.channels.add(channel)
      try {
        await existing.client.query(`LISTEN ${quoteIdent(channel)}`)
        log.debug(`Subscribed to channel "${channel}" for connection ${connectionId}`)
      } catch (err) {
        log.error(`Failed to LISTEN on channel "${channel}":`, err)
        throw err
      }
    }
    return
  }

  await connectListener(connectionId, config, new Set([channel]))
}

export async function unsubscribe(connectionId: string, channel: string): Promise<void> {
  const entry = listeners.get(connectionId)
  if (!entry || entry.destroyed) return

  entry.channels.delete(channel)

  try {
    await entry.client.query(`UNLISTEN ${quoteIdent(channel)}`)
    log.debug(`Unsubscribed from channel "${channel}" for connection ${connectionId}`)
  } catch (err) {
    log.error(`Failed to UNLISTEN channel "${channel}":`, err)
  }
}

export async function send(
  config: ConnectionConfig,
  channel: string,
  payload: string
): Promise<void> {
  const adapter = getAdapter(config)
  // Checked rather than left to the server so a non-Postgres connection gets the same
  // message the subscribe path gives, not a driver syntax error about pg_notify.
  if (!adapter.createNotificationClient) {
    throw new Error(`LISTEN/NOTIFY is not supported for ${adapter.dbType} connections`)
  }
  // One-shot, so this goes through the pool rather than opening (and tunnelling) a
  // connection of its own. Only a listener needs a session it can park on.
  await adapter.execute(config, 'SELECT pg_notify($1, $2)', [channel, payload])
}

export function getChannels(connectionId: string): PgNotificationChannel[] {
  const entry = listeners.get(connectionId)
  if (!entry || entry.destroyed) return []

  return Array.from(entry.channels).map((name) => {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT COUNT(*) as cnt, MAX(received_at) as last FROM pg_notification_events WHERE connection_id = ? AND channel = ?'
      )
      .get(connectionId, name) as { cnt: number; last: number | null }

    return {
      name,
      isListening: true,
      eventCount: row.cnt,
      lastEventAt: row.last ?? undefined
    }
  })
}

export function getHistory(connectionId: string, limit = 200): PgNotificationEvent[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, connection_id, channel, payload, received_at FROM pg_notification_events WHERE connection_id = ? ORDER BY received_at DESC LIMIT ?'
    )
    .all(connectionId, limit) as Array<{
    id: string
    connection_id: string
    channel: string
    payload: string
    received_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    channel: r.channel,
    payload: r.payload,
    receivedAt: r.received_at
  }))
}

export function clearHistory(connectionId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM pg_notification_events WHERE connection_id = ?').run(connectionId)
}

export async function cleanup(): Promise<void> {
  // Abandon every connection that has a timer parked, not just those with a live entry:
  // a connection whose last dial failed has no entry but may still have a retry armed.
  for (const connectionId of pendingReconnects.keys()) {
    abandoned.add(connectionId)
  }
  for (const connectionId of Array.from(pendingReconnects.keys())) {
    clearPendingReconnect(connectionId)
  }

  for (const [connectionId, entry] of listeners.entries()) {
    abandoned.add(connectionId)
    entry.destroyed = true
    await entry.client.close().catch((err) => {
      log.warn(`Failed to close listener client for ${connectionId} during cleanup:`, err)
    })
    listeners.delete(connectionId)
    statuses.delete(connectionId)
  }

  if (sqliteDb) {
    try {
      sqliteDb.close()
    } catch (err) {
      log.debug('Ignored error closing pg notifications sqlite db:', err)
    }
    sqliteDb = null
  }
}
