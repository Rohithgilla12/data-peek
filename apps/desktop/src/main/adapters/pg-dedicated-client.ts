import { Client } from 'pg'
import { resolvePostgresType, type ConnectionConfig, type QueryField } from '@shared/index'
import type { AdapterQueryResult, DedicatedClient, NotificationClient } from '../db-adapter'
import { closeTunnel, createTunnel, type TunnelSession } from '../ssh-tunnel-service'
import { buildClientConfig } from './pg-client-config'

/**
 * Dedicated (unpooled) Postgres connections.
 *
 * `pg-pool-manager` covers everything that borrows a connection for the length of one
 * call. This covers the opposite: a connection a feature owns until it is finished with
 * it, because server-side state lives on it — a stepped script's open transaction, a
 * LISTEN registration. Neither can come out of a pool, so each gets its own socket and,
 * when the connection rides SSH, its own tunnel.
 *
 * Everything else about the connection — TLS, keepalive, the `search_path` startup
 * option — comes from the same `buildClientConfig` the pools use, so a dedicated
 * connection can't drift from a pooled one.
 */

/** The shared plumbing behind every dedicated client, before a client shape is put on it. */
interface PgConnection {
  client: Client
  onDisconnect(handler: (error: Error | null) => void): void
  close(): Promise<void>
}

async function openConnection(config: ConnectionConfig): Promise<PgConnection> {
  let tunnel: TunnelSession | null = null
  if (config.ssh) {
    tunnel = await createTunnel(config)
  }

  const overrides = tunnel ? { host: tunnel.localHost, port: tunnel.localPort } : undefined
  const client = new Client(buildClientConfig(config, overrides))

  let handler: ((error: Error | null) => void) | null = null
  let died = false
  let cause: Error | null = null
  let closed = false

  const reportDeath = (error: Error | null): void => {
    // pg emits 'error' and then 'end' for one socket death. Reporting once keeps the
    // owner from running its recovery path twice over a single failure.
    if (died || closed) return
    died = true
    cause = error
    handler?.(error)
  }

  // Attached before connect() so a socket that dies mid-handshake reaches us rather
  // than Node's unhandled-'error' path, which would take the process down.
  client.on('error', reportDeath)
  client.on('end', () => reportDeath(null))

  try {
    await client.connect()
  } catch (err) {
    // A failed connect() leaves nothing to end(), but the tunnel is still ours.
    closeTunnel(tunnel)
    throw err
  }

  return {
    client,
    onDisconnect(next) {
      handler = next
      // The connection can die between connect() resolving and the owner registering.
      // Without this replay that death would go unreported and the owner would sit on
      // a connection it believes is live.
      if (died) next(cause)
    },
    async close() {
      if (closed) return
      closed = true
      try {
        await client.end()
      } finally {
        closeTunnel(tunnel)
      }
    }
  }
}

async function runQuery(
  client: Client,
  sql: string,
  params?: unknown[]
): Promise<AdapterQueryResult> {
  const res = params ? await client.query(sql, params) : await client.query(sql)
  const fields: QueryField[] = (res.fields ?? []).map((f) => ({
    name: f.name,
    dataType: resolvePostgresType(f.dataTypeID),
    dataTypeID: f.dataTypeID
  }))
  return { rows: res.rows ?? [], fields, rowCount: res.rowCount }
}

/** Open a dedicated connection the caller drives and closes itself. */
export async function createPgDedicatedClient(config: ConnectionConfig): Promise<DedicatedClient> {
  const conn = await openConnection(config)
  return {
    query: (sql, params) => runQuery(conn.client, sql, params),
    onDisconnect: conn.onDisconnect,
    close: conn.close
  }
}

/** Open a dedicated connection that also surfaces LISTEN/NOTIFY traffic. */
export async function createPgNotificationClient(
  config: ConnectionConfig
): Promise<NotificationClient> {
  const conn = await openConnection(config)
  return {
    query: (sql, params) => runQuery(conn.client, sql, params),
    onDisconnect: conn.onDisconnect,
    close: conn.close,
    onNotification(handler) {
      conn.client.on('notification', (msg) => handler(msg.channel, msg.payload ?? ''))
    }
  }
}
