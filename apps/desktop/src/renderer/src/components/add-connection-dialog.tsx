'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Database, CheckCircle2, XCircle, Link, Settings2, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useConnectionStore, type Connection } from '@/stores'
import { PostgreSQLIcon, MySQLIcon, MSSQLIcon, SQLiteIcon } from './database-icons'
import { SSHConfigSection } from './ssh-config-section'
import type { SSHConfig } from '@shared/index'
import type { DatabaseType } from '@shared/index'

interface AddConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: Connection | null
}

type InputMode = 'manual' | 'connection-string'

const DB_DEFAULTS: Record<DatabaseType, { port: string; user: string; database: string }> = {
  postgresql: { port: '5432', user: 'postgres', database: 'postgres' },
  mysql: { port: '3306', user: 'root', database: '' },
  sqlite: { port: '', user: '', database: '' },
  mssql: { port: '1433', user: 'sa', database: '' }
}

const DB_PROTOCOLS: Record<DatabaseType, string[]> = {
  postgresql: ['postgres', 'postgresql'],
  mysql: ['mysql'],
  sqlite: [],
  mssql: ['mssql', 'sqlserver']
}

/**
 * Parse MSSQL connection string with semicolon-separated parameters
 * Format: sqlserver://host:port;database=name;authentication=...;encrypt=...;trustServerCertificate=...
 */
function parseMSSQLConnectionString(connectionString: string): {
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
  mssqlOptions?: import('@shared/index').MSSQLConnectionOptions
} | null {
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
    const mssqlOptions: import('@shared/index').MSSQLConnectionOptions = {}
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

function parseConnectionString(
  connectionString: string,
  dbType: DatabaseType
): {
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
  mssqlOptions?: import('@shared/index').MSSQLConnectionOptions
} | null {
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

export function AddConnectionDialog({
  open,
  onOpenChange,
  connection: editConnection
}: AddConnectionDialogProps) {
  const addConnection = useConnectionStore((s) => s.addConnection)
  const updateConnection = useConnectionStore((s) => s.updateConnection)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const isEditMode = !!editConnection

  const [dbType, setDbType] = useState<DatabaseType>('postgresql')
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [connectionString, setConnectionString] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('postgres')
  const [password, setPassword] = useState('')
  const [ssl, setSsl] = useState(false)
  const [ssh, setSsh] = useState(false)

  const [sshConfig, setSshConfig] = useState<SSHConfig>({
    host: '',
    port: 22,
    user: '',
    authMethod: 'Password',
    password: '',
    privateKeyPath: '',
    passphrase: ''
  })

  const [mssqlOptions, setMssqlOptions] = useState<
    import('@shared/index').MSSQLConnectionOptions | undefined
  >(undefined)

  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const testResultRef = useRef<HTMLDivElement>(null)

  // Populate form when editing
  useEffect(() => {
    if (editConnection && open) {
      setDbType(editConnection.dbType || 'postgresql')
      setName(editConnection.name)
      setHost(editConnection.host)
      setPort(String(editConnection.port))
      setDatabase(editConnection.database)
      setUser(editConnection.user || '')
      setPassword(editConnection.password || '')
      setSsl(editConnection.ssl || false)
      setSsh(editConnection.ssh || false)
      setMssqlOptions(editConnection.mssqlOptions)

      if (editConnection.ssh && editConnection.sshConfig) {
        setSshConfig({
          host: editConnection.sshConfig.host || '',
          port: editConnection.sshConfig.port || 22,
          user: editConnection.sshConfig.user || '',
          authMethod:
            editConnection.sshConfig.authMethod ||
            (editConnection.sshConfig.privateKeyPath ? 'Public Key' : 'Password'),
          password: editConnection.sshConfig.password || '',
          privateKeyPath: editConnection.sshConfig.privateKeyPath || '',
          passphrase: editConnection.sshConfig.passphrase || ''
        })
      } else {
        setSshConfig({
          host: '',
          port: 22,
          user: '',
          authMethod: 'Password',
          password: '',
          privateKeyPath: '',
          passphrase: ''
        })
      }

      setInputMode('manual')
      setConnectionString('')
      setParseError(null)
      setTestResult(null)
      setTestError(null)
    }
  }, [editConnection, open])

  const handleDbTypeChange = (newType: DatabaseType) => {
    setDbType(newType)
    const defaults = DB_DEFAULTS[newType]
    setPort(defaults.port)
    // Only set default user if not MSSQL with ActiveDirectoryIntegrated
    if (newType === 'mssql' && mssqlOptions?.authentication === 'ActiveDirectoryIntegrated') {
      setUser('')
    } else {
      setUser(defaults.user)
    }
    if (defaults.database) {
      setDatabase(defaults.database)
    }
    // Clear MSSQL options when switching away from MSSQL
    if (newType !== 'mssql') {
      setMssqlOptions(undefined)
    }
    // SQLite doesn't support SSH/SSL, and doesn't use connection strings
    if (newType === 'sqlite') {
      setSsh(false)
      setSsl(false)
      setInputMode('manual')
      setHost('')
    }
    // Clear connection string when switching types
    setConnectionString('')
    setParseError(null)
    setTestResult(null)
    setTestError(null)
  }

  const handleConnectionStringChange = (value: string) => {
    setConnectionString(value)
    setParseError(null)

    if (!value.trim()) {
      return
    }

    const parsed = parseConnectionString(value, dbType)
    if (parsed) {
      setHost(parsed.host)
      setPort(parsed.port)
      setDatabase(parsed.database)
      setUser(parsed.user)
      setPassword(parsed.password)
      setSsl(parsed.ssl)
      if (parsed.mssqlOptions) {
        setMssqlOptions(parsed.mssqlOptions)
      } else {
        setMssqlOptions(undefined)
      }
    } else {
      let expectedFormat: string
      if (dbType === 'mysql') {
        expectedFormat = 'mysql://user:password@host:3306/database'
      } else if (dbType === 'mssql') {
        expectedFormat =
          'sqlserver://host:1433;database=name;authentication=...;encrypt=True;trustServerCertificate=true'
      } else {
        expectedFormat = 'postgresql://user:password@host:5432/database'
      }
      setParseError(`Invalid connection string format. Expected: ${expectedFormat}`)
    }
  }

  const resetForm = () => {
    setDbType('postgresql')
    setInputMode('manual')
    setConnectionString('')
    setParseError(null)
    setName('')
    setHost('localhost')
    setPort('5432')
    setDatabase('')
    setUser('postgres')
    setPassword('')
    setSsl(false)
    setSsh(false)
    setSshConfig({
      host: '',
      port: 22,
      user: '',
      authMethod: 'Password',
      password: '',
      privateKeyPath: '',
      passphrase: ''
    })
    setMssqlOptions(undefined)
    setTestResult(null)
    setTestError(null)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const getConnectionConfig = () => {
    // For ActiveDirectoryIntegrated, user/password are not needed
    const isActiveDirectoryIntegrated =
      dbType === 'mssql' && mssqlOptions?.authentication === 'ActiveDirectoryIntegrated'

    const sshConfigForConnection = ssh
      ? {
          host: sshConfig.host,
          port: sshConfig.port,
          user: sshConfig.user,
          authMethod: sshConfig.authMethod,
          password: sshConfig.password,
          privateKeyPath: sshConfig.privateKeyPath,
          passphrase: sshConfig.passphrase
        }
      : undefined

    return {
      id: editConnection?.id || crypto.randomUUID(),
      name: name || (dbType === 'sqlite' ? database : `${host}/${database}`),
      host,
      port: parseInt(port, 10) || 0,
      database,
      user: isActiveDirectoryIntegrated ? undefined : user,
      password: isActiveDirectoryIntegrated ? undefined : password || undefined,
      ssl,
      dbType,
      ssh,
      dstPort: parseInt(port, 10) || 0,
      sshConfig: sshConfigForConnection,
      ...(dbType === 'mssql' && mssqlOptions && { mssqlOptions })
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const config = getConnectionConfig()
      const result = await window.api.db.connect(config)

      if (result.success) {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestError(result.error || 'Connection failed')
      }
      setTimeout(() => {
        testResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } catch (error) {
      setTestResult('error')
      setTestError(error instanceof Error ? error.message : 'Unknown error')

      setTimeout(() => {
        testResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      const config = getConnectionConfig()

      if (isEditMode) {
        // Update existing connection
        await updateConnection(config.id, config)
        handleClose()
      } else {
        // Save new connection to persistent storage
        const result = await window.api.connections.add(config)

        if (result.success && result.data) {
          // Add to local store
          addConnection(result.data)

          // Auto-switch to the new connection
          const newConnectionId = result.data.id
          setConnectionStatus(newConnectionId, { isConnecting: true, error: undefined })
          setTimeout(() => {
            setConnectionStatus(newConnectionId, { isConnecting: false, isConnected: true })
            setActiveConnection(newConnectionId)
          }, 500)

          handleClose()
        } else {
          setTestResult('error')
          setTestError(result.error || 'Failed to save connection')
        }
      }
    } catch (error) {
      setTestResult('error')
      setTestError(error instanceof Error ? error.message : 'Unknown error')

      setTimeout(() => {
        testResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } finally {
      setIsSaving(false)
    }
  }

  // Check if user is required based on database type and authentication
  const isUserRequired =
    dbType !== 'mssql' || mssqlOptions?.authentication !== 'ActiveDirectoryIntegrated'

  const isSSHValid = () => {
    if (!ssh) return true

    const hasBasicSSH = sshConfig.host && sshConfig.port && sshConfig.user
    if (!hasBasicSSH) return false

    if (sshConfig.authMethod === 'Password') {
      return !!sshConfig.password
    } else {
      return !!sshConfig.privateKeyPath
    }
  }

  const isSqliteValid = () => {
    // Local SQLite only needs the database path
    return !!database
  }

  const isValid =
    dbType === 'sqlite'
      ? isSqliteValid()
      : inputMode === 'connection-string'
        ? connectionString &&
          !parseError &&
          host &&
          port &&
          database &&
          (isUserRequired ? user : true) &&
          isSSHValid()
        : host && port && database && (isUserRequired ? user : true) && isSSHValid()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Database className="size-5" />
            {isEditMode ? 'Edit Connection' : 'Add Connection'}
          </SheetTitle>
          <SheetDescription>
            {isEditMode
              ? 'Update your database connection settings.'
              : 'Add a new database connection. Your credentials are stored securely on your device.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 py-4 px-4 flex-1 overflow-y-auto">
          {/* Database Type Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Database Type</label>
            <div className="grid grid-cols-4 rounded-lg border bg-muted p-1">
              <button
                type="button"
                onClick={() => handleDbTypeChange('postgresql')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  dbType === 'postgresql'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PostgreSQLIcon className="size-4" />
                PostgreSQL
              </button>
              <button
                type="button"
                onClick={() => handleDbTypeChange('mysql')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  dbType === 'mysql'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MySQLIcon className="size-4" />
                MySQL
              </button>
              <button
                type="button"
                onClick={() => handleDbTypeChange('sqlite')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  dbType === 'sqlite'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <SQLiteIcon className="size-4" />
                SQLite
              </button>
              <button
                type="button"
                onClick={() => handleDbTypeChange('mssql')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  dbType === 'mssql'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MSSQLIcon className="size-4" />
                SQL Server
              </button>
            </div>
          </div>

          {/* Input Mode Toggle - hidden for SQLite */}
          {dbType !== 'sqlite' && (
            <div className="flex rounded-lg border bg-muted p-1">
              <button
                type="button"
                onClick={() => setInputMode('manual')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  inputMode === 'manual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Settings2 className="size-4" />
                Manual
              </button>
              <button
                type="button"
                onClick={() => setInputMode('connection-string')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  inputMode === 'connection-string'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link className="size-4" />
                Connection String
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              Connection Name
            </label>
            <Input
              id="name"
              placeholder="My Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Defaults to host/database if empty.
            </p>
          </div>

          {/* SQLite-specific form */}
          {dbType === 'sqlite' ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="database" className="text-sm font-medium">
                  Database File Path
                </label>
                <div className="flex gap-2">
                  <Input
                    id="database"
                    placeholder="/path/to/database.db or :memory:"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    className="font-mono text-sm flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const filePath = await window.api.files.openFilePicker()
                      if (filePath) {
                        setDatabase(filePath)
                      }
                    }}
                    title="Browse for SQLite database file"
                  >
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the path to your SQLite database file, or use :memory: for an in-memory
                  database.
                </p>
              </div>
              <div className="rounded-md bg-muted/50 border border-border/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Turso / libSQL support coming soon.
                  </span>{' '}
                  We&apos;re working on resolving some native module issues.
                </p>
              </div>
            </div>
          ) : inputMode === 'connection-string' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="connection-string" className="text-sm font-medium">
                Connection String
              </label>
              <Input
                id="connection-string"
                placeholder={
                  dbType === 'mysql'
                    ? 'mysql://user:password@host:3306/database'
                    : dbType === 'mssql'
                      ? 'mssql://user:password@host:1433/database'
                      : 'postgresql://user:password@host:5432/database'
                }
                value={connectionString}
                onChange={(e) => handleConnectionStringChange(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format:{' '}
                {dbType === 'mysql'
                  ? 'mysql://user:password@host:port/database'
                  : dbType === 'mssql'
                    ? 'sqlserver://host:port;database=name;encrypt=false;trustServerCertificate=true'
                    : 'postgresql://user:password@host:port/database'}
              </p>
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {connectionString && !parseError && (
                <div className="rounded-md bg-muted p-3 text-xs">
                  <p className="font-medium mb-1">Parsed values:</p>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Host:</span>
                    <span className="font-mono">{host}</span>
                    <span>Port:</span>
                    <span className="font-mono">{port}</span>
                    <span>Database:</span>
                    <span className="font-mono">{database}</span>
                    <span>User:</span>
                    <span className="font-mono">{user}</span>
                    <span>Password:</span>
                    <span className="font-mono">{password ? '••••••••' : '(none)'}</span>
                    <span>SSL:</span>
                    <span className="font-mono">{ssl ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="host" className="text-sm font-medium">
                  Host
                </label>
                <Input
                  id="host"
                  placeholder="localhost"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="port" className="text-sm font-medium">
                  Port
                </label>
                <Input
                  id="port"
                  type="number"
                  placeholder="5432"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="database" className="text-sm font-medium">
                  Database
                </label>
                <Input
                  id="database"
                  placeholder="postgres"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="user" className="text-sm font-medium">
                  Username
                  {dbType === 'mssql' &&
                    mssqlOptions?.authentication === 'ActiveDirectoryIntegrated' && (
                      <span className="text-xs text-muted-foreground font-normal ml-1">
                        (optional for Active Directory Integrated)
                      </span>
                    )}
                </label>
                <Input
                  id="user"
                  placeholder={
                    dbType === 'mssql' &&
                    mssqlOptions?.authentication === 'ActiveDirectoryIntegrated'
                      ? 'Not required for Active Directory Integrated'
                      : dbType === 'mssql'
                        ? 'sa'
                        : 'postgres'
                  }
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="flex space-x-4">
                <div className="flex items-center gap-2">
                  <input
                    id="ssl"
                    type="checkbox"
                    checked={ssl}
                    onChange={(e) => setSsl(e.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  <label htmlFor="ssl" className="text-sm font-medium">
                    Use SSL
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="ssh"
                    type="checkbox"
                    checked={ssh}
                    onChange={() => setSsh(!ssh)}
                    className="size-4 rounded border-input"
                  />
                  <label htmlFor="ssh" className="text-sm font-medium">
                    Use SSH
                  </label>
                </div>
              </div>
            </>
          )}

          {ssh && dbType !== 'sqlite' && (
            <SSHConfigSection config={sshConfig} onConfigChange={setSshConfig} />
          )}

          {testResult && (
            <div
              ref={testResultRef}
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                testResult === 'success'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {testResult === 'success' ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Connection successful!
                </>
              ) : (
                <>
                  <XCircle className="size-4" />
                  {testError}
                </>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2 shrink-0 border-t pt-4">
          <Button variant="outline" onClick={handleTestConnection} disabled={!isValid || isTesting}>
            {isTesting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isEditMode ? 'Updating...' : 'Saving...'}
              </>
            ) : isEditMode ? (
              'Update Connection'
            ) : (
              'Save Connection'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
