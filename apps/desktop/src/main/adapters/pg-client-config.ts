import { readFileSync } from 'fs'
import type { ClientConfig } from 'pg'
import type { ConnectionConfig } from '@shared/index'

/**
 * Build pg ClientConfig from a ConnectionConfig.
 *
 * Handles SSL options for cloud databases (AWS RDS, Supabase, Neon, DigitalOcean) and
 * accepts an `overrides` host/port pair when the connection is going through an SSH tunnel.
 */
export function buildClientConfig(
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

    if (sslOptions.ca) {
      try {
        clientConfig.ssl = {
          rejectUnauthorized: sslOptions.rejectUnauthorized !== false,
          ca: readFileSync(sslOptions.ca, 'utf-8')
        }
      } catch (err) {
        console.error(`Failed to read CA certificate from ${sslOptions.ca}:`, err)
        throw new Error(
          `Failed to read CA certificate file: ${sslOptions.ca}. Please verify the file exists and is readable.`
        )
      }
    } else {
      // Default to rejectUnauthorized: false so cloud DBs with self-signed / private-CA
      // certs work out of the box. Users opt into strict verification via the UI.
      clientConfig.ssl = {
        rejectUnauthorized: sslOptions.rejectUnauthorized === true
      }
    }
  }

  return clientConfig
}
