import { Client } from 'pg'
import { resolvePostgresType, type ConnectionConfig, type QueryField } from '@shared/index'
import type { AdapterQueryResult, DedicatedClient, NotificationClient } from '../db-adapter'
import { closeTunnel, createTunnel, type TunnelSession } from '../ssh-tunnel-service'
import { buildClientConfig, registerPgTypeParsers } from './pg-client-config'
import { createLogger } from '../lib/logger'

/**
 * Dedicated (unpooled) Postgres connections.
 *
 * `pg-pool-manager` covers everything that borrows a connection for the length of one
 * call. This covers connections a feature owns outright, because state the caller
 * depends on lives on the backend session: a LISTEN registration, which is bound to one
 * session and cannot be pooled at all, and a stepped script, which holds a transaction
 * and other session state across many IPC calls. (A `BEGIN`-and-hold transaction *can*
 * come from the session pool — see `acquirePgSessionClient` — but step sessions stay
 * open for as long as a user leaves the panel up, and parking them in that pool would
 * spend its small budget on connections that are idle almost all the time.)
 *
 * Client config comes from the same `buildClientConfig` the pools use, so TLS,
 * keepalive and the `search_path` startup option can't drift between the two paths.
 */

const log = createLogger('pg-dedicated-client')

/** The shared plumbing behind every dedicated client, before a client shape is put on it. */
interface PgConnection {
  client: Client
  onDisconnect(handler: (error: Error | null) => void): void
  close(): Promise<void>
}

async function openConnection(config: ConnectionConfig): Promise<PgConnection> {
  let tunnel: TunnelSession | null = null
  let client: Client | null = null

  let handler: ((error: Error | null) => void) | null = null
  let died = false
  let cause: Error | null = null
  let closeRequested = false
  let closing: Promise<void> | null = null

  const reportDeath = (error: Error | null): void => {
    // pg emits 'error' and then 'end' for one socket death. Reporting once keeps the
    // owner from running its recovery path twice over a single failure.
    if (died || closeRequested) return
    died = true
    cause = error
    if (!handler) {
      // Held for replay in onDisconnect, but if nobody ever registers, a connection
      // died and no one was told — say so rather than losing it to a closure.
      log.error('Dedicated Postgres connection died with no disconnect handler:', error)
      return
    }
    handler(error)
  }

  // One try from the first resource acquired: the tunnel is ours the moment createTunnel
  // resolves, and buildClientConfig can still throw after that (an unreadable CA file).
  try {
    if (config.ssh) {
      tunnel = await createTunnel(config)
    }

    const overrides = tunnel ? { host: tunnel.localHost, port: tunnel.localPort } : undefined
    registerPgTypeParsers()
    // Two bindings for one object: the outer `client` lets the catch reclaim a socket
    // whatever stage the open failed at, `pgClient` is the non-null one the returned
    // closures capture.
    const pgClient = new Client(buildClientConfig(config, overrides))
    client = pgClient

    // Attached before connect() so there is no window between the handshake completing
    // and a listener existing. pg routes most handshake failures through connect()'s
    // rejection rather than this event, but an 'error' that arrives with no listener is
    // an uncaught exception in the main process, so the window has to be closed.
    pgClient.on('error', reportDeath)
    pgClient.on('end', () => reportDeath(null))

    await pgClient.connect()

    return {
      client: pgClient,
      onDisconnect(next) {
        // Single-handler, like onNotification: a later registration replaces the earlier
        // one rather than adding to it.
        handler = next
        // The connection can die between connect() resolving and the owner registering.
        // Without this replay that death would go unreported and the owner would sit on
        // a connection it believes is live.
        if (died) next(cause)
      },
      close() {
        // Set before the teardown starts so a death caused by our own end() is not
        // reported as a surprise disconnect.
        closeRequested = true
        // Memoised rather than guarded by a boolean: a second caller has to await the
        // same teardown, not race past a half-finished one.
        closing ??= (async () => {
          try {
            await pgClient.end()
          } catch (err) {
            log.error('Dedicated Postgres connection did not close cleanly:', err)
            throw err
          } finally {
            closeTunnel(tunnel)
          }
        })()
        return closing
      }
    }
  } catch (err) {
    // end() is a no-op on a client whose socket already died, which is how connect()
    // usually fails — but a few rejection paths leave the stream open, and that socket
    // is only reclaimable here.
    await client?.end().catch(() => {
      // Already dead; the throw below is the failure worth reporting.
    })
    closeTunnel(tunnel)
    throw err
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

  // The pg listener is attached once here rather than inside onNotification: pg's `on`
  // accumulates, so registering per call would deliver every notification once per
  // registration.
  let notify: ((channel: string, payload: string) => void) | null = null
  conn.client.on('notification', (msg) => notify?.(msg.channel, msg.payload ?? ''))

  return {
    query: (sql, params) => runQuery(conn.client, sql, params),
    onDisconnect: conn.onDisconnect,
    close: conn.close,
    onNotification(handler) {
      notify = handler
    }
  }
}
