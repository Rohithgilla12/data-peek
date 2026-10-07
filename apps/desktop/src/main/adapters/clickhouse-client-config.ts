import { readFileSync } from 'fs'
import https from 'https'
import type { ClickHouseClientConfigOptions } from '@clickhouse/client'
import type { ConnectionConfig } from '@shared/index'

/** The native TCP ports. data-peek speaks HTTP, so a connection to these can only hang. */
const NATIVE_PORTS = new Set([9000, 9440])

/**
 * One request may carry a whole multi-statement script's longest statement, so the
 * client-side request timeout is effectively off; the per-statement deadline is the
 * server's max_execution_time plus the abort backstop in the adapter.
 */
const REQUEST_TIMEOUT_MS = 24 * 60 * 60 * 1000

export function clickhouseUrl(host: string, port: number, ssl: boolean): string {
  return `${ssl ? 'https' : 'http'}://${host}:${port}`
}

export function assertHttpPort(port: number): void {
  if (NATIVE_PORTS.has(port)) {
    throw new Error(
      `Port ${port} is the ClickHouse native port; data-peek uses the HTTP interface, usually 8123 or 8443 for TLS.`
    )
  }
}

/**
 * `ssl` selects https. `overrides` is the SSH tunnel's local endpoint (same contract as
 * the pg/mysql client configs). `sslOptions.ca` is read here, once.
 */
export function toClickHouseClientConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): ClickHouseClientConfigOptions {
  assertHttpPort(config.port)
  const host = overrides?.host ?? config.host
  const port = overrides?.port ?? config.port

  const options: ClickHouseClientConfigOptions = {
    url: clickhouseUrl(host, port, Boolean(config.ssl)),
    username: config.user || 'default',
    password: config.password ?? '',
    database: config.database || 'default',
    application: 'data-peek',
    request_timeout: REQUEST_TIMEOUT_MS,
    keep_alive: { enabled: true },
    clickhouse_settings: {
      // 64-bit integers and decimals arrive as strings so no precision is lost in JSON.
      output_format_json_quote_64bit_integers: 1,
      output_format_json_quote_decimals: 1,
      // A dropped HTTP socket (cancel, crash) stops the query server-side too.
      cancel_http_readonly_queries_on_client_close: 1
    }
  }

  if (config.ssl) {
    const sslOptions = config.sslOptions ?? {}
    let ca: Buffer | undefined
    if (sslOptions.ca) {
      try {
        ca = readFileSync(sslOptions.ca)
      } catch {
        throw new Error(
          `Failed to read CA certificate file: ${sslOptions.ca}. Please verify the file exists and is readable.`
        )
      }
    }
    if (sslOptions.rejectUnauthorized === false) {
      // The client's `tls` option has no verification switch; a custom agent is the
      // documented way to accept a self-signed certificate.
      options.http_agent = new https.Agent({ rejectUnauthorized: false, ca, keepAlive: true })
    } else if (ca) {
      options.tls = { ca_cert: ca }
    }
  }

  return options
}
