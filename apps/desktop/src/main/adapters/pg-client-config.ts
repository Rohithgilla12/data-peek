import { readFileSync } from 'fs'
import type { ClientConfig } from 'pg'
import type { ConnectionConfig } from '@shared/index'

/**
 * Split a user-entered default schema into individual schema names.
 *
 * A comma-separated value sets a fallback chain, mirroring how `search_path`
 * itself works, so `"bbl, public"` resolves unqualified names against `bbl`
 * first and `public` second.
 */
export function parseSchemaList(schema: string | undefined): string[] {
  if (!schema) return []
  return (
    schema
      .split(',')
      .map((name) => name.trim())
      // `SHOW search_path` reports quoted identifiers, so a value pasted straight from psql
      // arrives as `"bbl","public"`. Unwrap it rather than re-quoting into `"""bbl"""`.
      .map((name) => name.replace(/^"(.*)"$/, '$1'))
      .map((name) => name.trim())
      .filter(Boolean)
  )
}

/**
 * Build the `options` startup parameter that pins `search_path` to `schema`.
 *
 * Each name is double-quoted so mixed-case schemas and reserved words survive the
 * GUC's identifier parsing. The result is then backslash-escaped because the server
 * splits `options` on unescaped whitespace (`pg_split_opts`) and strips backslashes
 * before the value ever reaches the GUC parser — quotes themselves pass through
 * untouched, which is what makes the two layers compose.
 *
 * Returns undefined when no schema is configured, leaving the server default in place.
 */
export function buildSearchPathOption(schema: string | undefined): string | undefined {
  const names = parseSchemaList(schema)
  if (names.length === 0) return undefined

  const searchPath = names.map((name) => `"${name.replace(/"/g, '""')}"`).join(',')
  return `-c search_path=${searchPath.replace(/[\\\s]/g, '\\$&')}`
}

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

  // Applied at connection startup rather than via a follow-up SET, so every physical
  // connection a pool opens is already on the right search_path before it hands out
  // its first client.
  const searchPathOption = buildSearchPathOption(config.schema)
  if (searchPathOption) {
    clientConfig.options = searchPathOption
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
