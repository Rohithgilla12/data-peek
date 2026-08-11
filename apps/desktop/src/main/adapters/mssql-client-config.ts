import sql from 'mssql'
import type { ConnectionConfig } from '@shared/index'

/**
 * Create MSSQL connection config from our ConnectionConfig.
 *
 * Lives apart from the adapter so the pool manager can build a config without importing
 * the adapter that consumes the pool.
 */
export function toMSSQLConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): sql.config {
  const mssqlOptions = config.mssqlOptions || {}

  // Handle authentication methods first to determine what options are needed
  const authentication = mssqlOptions.authentication
  const isAzureAD = authentication === 'ActiveDirectoryIntegrated'

  // Build options object - for Azure AD, keep it minimal
  const defaultSsl = config.ssl ?? false
  const options: sql.config['options'] = {}

  // Always set encrypt if specified
  if (mssqlOptions.encrypt !== undefined) {
    options.encrypt = mssqlOptions.encrypt
  } else if (defaultSsl) {
    options.encrypt = true
  }

  // For Azure AD, don't set trustServerCertificate or enableArithAbort
  // These can interfere with Azure AD authentication
  if (!isAzureAD) {
    if (mssqlOptions.trustServerCertificate !== undefined) {
      options.trustServerCertificate = mssqlOptions.trustServerCertificate
    } else if (!defaultSsl) {
      options.trustServerCertificate = true
    }
    options.enableArithAbort = mssqlOptions.enableArithAbort ?? true
  }

  // Add connection timeout if specified
  if (mssqlOptions.connectionTimeout !== undefined) {
    options.connectTimeout = mssqlOptions.connectionTimeout
  }

  // Set request timeout (default to 0 = no timeout to allow long-running queries)
  // The mssql library defaults to 15000ms which is too short for complex queries
  options.requestTimeout = mssqlOptions.requestTimeout ?? 0

  // Build base config
  const sqlConfig: sql.config = {
    server: overrides?.host ?? config.host,
    database: config.database,
    options
  }

  // Include port if provided (optional in mssql config)
  if (overrides?.port) {
    sqlConfig.port = overrides.port
  } else if (config.port) {
    sqlConfig.port = config.port
  }

  // Handle authentication methods
  if (authentication === 'ActiveDirectoryIntegrated') {
    // Azure AD Integrated Authentication - uses azure-active-directory-default
    sqlConfig.authentication = {
      type: 'azure-active-directory-default',
      options: {}
    }
    // Explicitly don't set user/password for Azure AD authentication
    // Even if they exist in config, we should not include them
  } else if (authentication === 'ActiveDirectoryPassword') {
    // Azure AD Password Authentication
    // Note: This requires clientId and tenantId which aren't in our config yet
    // For now, use SQL Server auth as fallback
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  } else if (authentication === 'ActiveDirectoryServicePrincipal') {
    // Azure AD Service Principal - would need clientId and clientSecret
    // For now, fall back to SQL Server auth
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  } else {
    // Default: SQL Server Authentication
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  }

  return sqlConfig
}
