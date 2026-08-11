import { readFileSync } from 'fs'
import type mysql from 'mysql2/promise'
import type { ConnectionConfig } from '@shared/index'

/**
 * Create MySQL connection config from our ConnectionConfig.
 * Properly handles SSL options for cloud databases like AWS RDS.
 *
 * Lives apart from the adapter so the pool manager can build a config without importing
 * the adapter that consumes the pool.
 */
export function toMySQLConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): mysql.ConnectionOptions {
  const mysqlConfig: mysql.ConnectionOptions = {
    host: overrides?.host ?? config.host,
    port: overrides?.port ?? config.port,
    user: config.user,
    password: config.password,
    database: config.database
  }

  if (config.ssl) {
    const sslOptions = config.sslOptions || {}

    if (sslOptions.ca) {
      try {
        mysqlConfig.ssl = {
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
      // Default to rejectUnauthorized: false so cloud MySQL (RDS, PlanetScale,
      // Aiven) with self-signed / private-CA certs works out of the box.
      // Strict verification is opt-in via the UI.
      mysqlConfig.ssl = {
        rejectUnauthorized: sslOptions.rejectUnauthorized === true
      }
    }
  }

  return mysqlConfig
}
