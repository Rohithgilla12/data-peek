import { Client, type ClientConfig } from 'pg'
import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import Database from 'better-sqlite3'
import type { ConnectionConfig, PgNotificationEvent, PgNotificationChannel } from '@shared/index'
import { createTunnel, closeTunnel, TunnelSession } from './ssh-tunnel-service'
import { createLogger } from './lib/logger'

const log = createLogger('pg-notification-listener')

const MAX_EVENTS_PER_CONNECTION = 10000
const MAX_BACKOFF_MS = 30_000

function buildClientConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): ClientConfig {
  const clientConfig: ClientConfig = {
    host: overrides?.host ?? config.host,
    port: overrides?.port ?? config.port,
    database: config.database,
    user: config.user,
    password: config.password
  }

  if (config.ssl) {
    const sslOptions = config.sslOptions || {}

    if (sslOptions.rejectUnauthorized === false) {
      clientConfig.ssl = { rejectUnauthorized: false }
    } else if (sslOptions.ca) {
      try {
        clientConfig.ssl = { rejectUnauthorized: true, ca: readFileSync(sslOptions.ca, 'utf-8') }
      } catch (err) {
        throw new Error(
          `Failed to read CA certificate file: ${sslOptions.ca}. ${(err as Error).message}`
        )
      }
    } else {
      clientConfig.ssl = true
    }
  }

  return clientConfig
}

interface ListenerEntry {
  client: Client
  tunnelSession: TunnelSession | null
  channels: Set<string>
  connectedSince: number
  reconnectTimer?: ReturnType<typeof setTimeout>
  destroyed: boolean
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

async function connectListener(
  connectionId: string,
  config: ConnectionConfig,
  channels: Set<string>,
  backoffMs = 1000
): Promise<void> {
  const existing = listeners.get(connectionId)
  if (existing) {
    existing.destroyed = true
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer)
    try {
      await existing.client.end()
    } catch {
      // ignore close errors
    }
    closeTunnel(existing.tunnelSession)
  }

  let tunnelSession: TunnelSession | null = null
  try {
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }

    const overrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined

    const client = new Client(buildClientConfig(config, overrides))

    const entry: ListenerEntry = {
      client,
      tunnelSession,
      channels: new Set(channels),
      connectedSince: Date.now(),
      destroyed: false
    }
    listeners.set(connectionId, entry)

    client.on('notification', (msg) => {
      const event: PgNotificationEvent = {
        id: randomUUID(),
        connectionId,
        channel: msg.channel,
        payload: msg.payload ?? '',
        receivedAt: Date.now()
      }

      persistEvent(event)
      broadcastEvent(event)
    })

    client.on('error', (err) => {
      if (entry.destroyed) return
      log.error(`pg notification client error for ${connectionId}:`, err)
      scheduleReconnect(connectionId, config, entry.channels, backoffMs)
    })

    client.on('end', () => {
      if (entry.destroyed) return
      log.warn(`pg notification client disconnected for ${connectionId}, reconnecting...`)
      scheduleReconnect(connectionId, config, entry.channels, backoffMs)
    })

    await client.connect()

    for (const channel of channels) {
      await client.query(`LISTEN ${quoteIdent(channel)}`)
      log.debug(`Listening on channel "${channel}" for connection ${connectionId}`)
    }
  } catch (err) {
    log.error(`Failed to connect listener for ${connectionId}:`, err)
    closeTunnel(tunnelSession)
    scheduleReconnect(connectionId, config, channels, backoffMs)
  }
}

function scheduleReconnect(
  connectionId: string,
  config: ConnectionConfig,
  channels: Set<string>,
  backoffMs: number
): void {
  const entry = listeners.get(connectionId)
  if (entry?.destroyed) return

  const nextBackoff = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
  log.debug(`Reconnecting ${connectionId} in ${backoffMs}ms`)

  const timer = setTimeout(() => {
    const current = listeners.get(connectionId)
    if (current?.destroyed) return
    connectListener(connectionId, config, channels, nextBackoff)
  }, backoffMs)

  if (entry) {
    entry.reconnectTimer = timer
  }
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
  let tunnelSession: TunnelSession | null = null
  try {
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }

    const overrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined

    const client = new Client(buildClientConfig(config, overrides))
    await client.connect()
    try {
      await client.query('SELECT pg_notify($1, $2)', [channel, payload])
    } finally {
      await client.end().catch(() => {})
    }
  } finally {
    closeTunnel(tunnelSession)
  }
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
  for (const [connectionId, entry] of listeners.entries()) {
    entry.destroyed = true
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer)
    try {
      await entry.client.end()
    } catch {
      // ignore close errors
    }
    closeTunnel(entry.tunnelSession)
    listeners.delete(connectionId)
  }

  if (sqliteDb) {
    try {
      sqliteDb.close()
    } catch {
      // ignore close errors
    }
    sqliteDb = null
  }
}
