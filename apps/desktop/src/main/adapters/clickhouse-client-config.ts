import { readFileSync } from 'fs'
import https from 'https'
import type { ClickHouseClientConfigOptions } from '@clickhouse/client'
import type { ConnectionConfig } from '@shared/index'

const NATIVE_PORTS = new Set([9000, 9440])

const CLIENT_TIMEOUT_DISABLED_MS = 24 * 60 * 60 * 1000

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
    request_timeout: CLIENT_TIMEOUT_DISABLED_MS,
    keep_alive: { enabled: true },
    clickhouse_settings: {
      output_format_json_quote_64bit_integers: 1,
      output_format_json_quote_decimals: 1,
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
