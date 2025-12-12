import type { DatabaseType, MSSQLConnectionOptions } from '@shared/index'

export const DB_DEFAULTS: Record<DatabaseType, { port: string; user: string; database: string }> = {
  postgresql: { port: '5432', user: 'postgres', database: 'postgres' },
  mysql: { port: '3306', user: 'root', database: '' },
  sqlite: { port: '', user: '', database: '' },
  mssql: { port: '1433', user: 'sa', database: '' }
}

export const DB_PROTOCOLS: Record<DatabaseType, string[]> = {
  postgresql: ['postgres', 'postgresql'],
  mysql: ['mysql'],
  sqlite: [],
  mssql: ['mssql', 'sqlserver']
}

export interface ParsedConnectionConfig {
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
  mssqlOptions?: MSSQLConnectionOptions
}

/**
 * Parse MSSQL connection string with semicolon-separated parameters
 * Format: sqlserver://host:port;database=name;authentication=...;encrypt=...;trustServerCertificate=...
 */
export function parseMSSQLConnectionString(connectionString: string): ParsedConnectionConfig | null {
  try {
    // Split protocol/authority from parameters
    const parts = connectionString.split(';')
    const urlPart = parts[0]
    const paramsPart = parts.slice(1).join(';')

    // Parse URL part (protocol://host:port)
    const url = new URL(urlPart)
    const protocol = url.protocol.replace(':', '').toLowerCase()

    // Validate protocol
    if (!protocol.startsWith('mssql') && !protocol.startsWith('sqlserver')) {
      return null
    }

    const defaults = DB_DEFAULTS.mssql
    const host = url.hostname || 'localhost'
    const port = url.port || defaults.port

    // Parse semicolon-separated parameters
    const params: Record<string, string> = {}
    const paramPairs = paramsPart.split(';').filter((p) => p.trim())
    for (const pair of paramPairs) {
      const [key, ...valueParts] = pair.split('=')
      if (key && valueParts.length > 0) {
        // Normalize key: remove spaces and convert to lowercase for consistent lookup
        const normalizedKey = key.trim().replace(/\s+/g, '').toLowerCase()
        params[normalizedKey] = valueParts.join('=').trim()
      }
    }

    // Helper to lookup parameter with multiple possible keys
    const getParam = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const normalized = key.replace(/\s+/g, '').toLowerCase()
        if (params[normalized]) return params[normalized]
      }
      return undefined
    }

    // Extract values from parameters (support both spaced and compact keys)
    const database = getParam('database', 'initial catalog', 'initialcatalog') || defaults.database

    // Check authentication method first
    const authentication = getParam('authentication')?.toLowerCase()
    const isActiveDirectoryIntegrated = authentication === 'activedirectoryintegrated'

    // For ActiveDirectoryIntegrated, user/password are not needed
    const user = isActiveDirectoryIntegrated
      ? ''
      : getParam('user', 'user id', 'userid', 'uid') || defaults.user
    const password = isActiveDirectoryIntegrated ? '' : getParam('password', 'pwd') || ''

    // Parse encryption/SSL settings
    const encrypt = getParam('encrypt')?.toLowerCase()
    let ssl = false
    let encryptValue: boolean | undefined
    if (encrypt === 'true' || encrypt === 'yes' || encrypt === '1') {
      ssl = true
      encryptValue = true
    } else if (encrypt === 'false' || encrypt === 'no' || encrypt === '0') {
      ssl = false
      encryptValue = false
    } else {
      // Default to true for Azure SQL (encrypt is usually required)
      ssl = host.includes('.database.windows.net')
      encryptValue = ssl
    }

    // Parse trustServerCertificate (support spaced variants)
    const trustServerCert = getParam(
      'trustservercertificate',
      'trust server certificate',
      'trustservercert'
    )?.toLowerCase()
    const trustServerCertificate =
      trustServerCert === 'true' || trustServerCert === 'yes' || trustServerCert === '1'
        ? true
        : trustServerCert === 'false' || trustServerCert === 'no' || trustServerCert === '0'
          ? false
          : undefined

    // Parse authentication method (already checked above, but need the original value)
    const authenticationParam = getParam('authentication')
    let authMethod:
      | 'SQL Server Authentication'
      | 'ActiveDirectoryIntegrated'
      | 'ActiveDirectoryPassword'
      | 'ActiveDirectoryServicePrincipal'
      | 'ActiveDirectoryDeviceCodeFlow'
      | undefined

    if (authenticationParam) {
      const authLower = authenticationParam.toLowerCase()
      if (authLower === 'activedirectoryintegrated') {
        authMethod = 'ActiveDirectoryIntegrated'
      } else if (authLower === 'activedirectorypassword') {
        authMethod = 'ActiveDirectoryPassword'
      } else if (authLower === 'activedirectoryserviceprincipal') {
        authMethod = 'ActiveDirectoryServicePrincipal'
      } else if (authLower === 'activedirectorydevicecodeflow') {
        authMethod = 'ActiveDirectoryDeviceCodeFlow'
      } else if (authLower === 'sql server authentication' || authLower === 'sqlserver') {
        authMethod = 'SQL Server Authentication'
      }
    }

    // Parse connection timeout (support spaced variants)
    const connectionTimeoutStr = getParam(
      'connectiontimeout',
      'connection timeout',
      'connecttimeout',
      'connect timeout'
    )
    const connectionTimeout = connectionTimeoutStr ? parseInt(connectionTimeoutStr, 10) : undefined

    // Parse request timeout (support spaced variants)
    const requestTimeoutStr = getParam('requesttimeout', 'request timeout')
    const requestTimeout = requestTimeoutStr ? parseInt(requestTimeoutStr, 10) : undefined

    // Build MSSQL options
    const mssqlOptions: MSSQLConnectionOptions = {}
    if (authMethod) mssqlOptions.authentication = authMethod
    if (encryptValue !== undefined) mssqlOptions.encrypt = encryptValue
    if (trustServerCertificate !== undefined)
      mssqlOptions.trustServerCertificate = trustServerCertificate
    if (connectionTimeout !== undefined && !isNaN(connectionTimeout))
      mssqlOptions.connectionTimeout = connectionTimeout
    if (requestTimeout !== undefined && !isNaN(requestTimeout))
      mssqlOptions.requestTimeout = requestTimeout

    // Only include mssqlOptions if it has at least one property
    const hasOptions = Object.keys(mssqlOptions).length > 0

    return {
      host,
      port,
      database,
      user,
      password,
      ssl,
      ...(hasOptions && { mssqlOptions })
    }
  } catch {
    return null
  }
}

/**
 * Parse a generic database connection string
 */
export function parseConnectionString(
  connectionString: string,
  dbType: DatabaseType
): ParsedConnectionConfig | null {
  // MSSQL has special connection string format with semicolons
  if (dbType === 'mssql') {
    // Check if it's the semicolon-separated format
    if (connectionString.includes(';') && connectionString.match(/^(mssql|sqlserver):\/\//i)) {
      return parseMSSQLConnectionString(connectionString)
    }
  }

  try {
    const url = new URL(connectionString)
    const protocol = url.protocol.replace(':', '').toLowerCase()

    // Validate protocol matches db type (case-insensitive)
    const validProtocols = DB_PROTOCOLS[dbType]
    if (
      validProtocols.length > 0 &&
      !validProtocols.some((p) => protocol.startsWith(p.toLowerCase()))
    ) {
      return null
    }

    const defaults = DB_DEFAULTS[dbType]
    const host = url.hostname || 'localhost'
    const port = url.port || defaults.port
    const database = url.pathname.replace(/^\//, '') || defaults.database
    const user = url.username || defaults.user
    const password = decodeURIComponent(url.password || '')

    // Check for SSL in query params
    const sslParam = url.searchParams.get('sslmode') || url.searchParams.get('ssl')
    const ssl = sslParam ? !['disable', 'false', '0'].includes(sslParam.toLowerCase()) : false

    return { host, port, database, user, password, ssl }
  } catch {
    return null
  }
}
