'use client'

import { useState, useEffect } from 'react'
import { Loader2, Database, CheckCircle2, XCircle, Link, Settings2 } from 'lucide-react'
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
import { PostgreSQLIcon, MySQLIcon } from './database-icons'
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
  sqlite: { port: '', user: '', database: '' }
}

const DB_PROTOCOLS: Record<DatabaseType, string[]> = {
  postgresql: ['postgres', 'postgresql'],
  mysql: ['mysql'],
  sqlite: []
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
} | null {
  try {
    const url = new URL(connectionString)
    const protocol = url.protocol.replace(':', '')

    // Validate protocol matches db type
    const validProtocols = DB_PROTOCOLS[dbType]
    if (!validProtocols.some((p) => protocol.startsWith(p))) {
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

  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editConnection && open) {
      setDbType(editConnection.dbType || 'postgresql')
      setName(editConnection.name)
      setHost(editConnection.host)
      setPort(String(editConnection.port))
      setDatabase(editConnection.database)
      setUser(editConnection.user)
      setPassword(editConnection.password || '')
      setSsl(editConnection.ssl || false)
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
    setUser(defaults.user)
    if (defaults.database) {
      setDatabase(defaults.database)
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
    } else {
      const expectedFormat =
        dbType === 'mysql'
          ? 'mysql://user:password@host:3306/database'
          : 'postgresql://user:password@host:5432/database'
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
    setTestResult(null)
    setTestError(null)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const getConnectionConfig = () => ({
    id: editConnection?.id || crypto.randomUUID(),
    name: name || `${host}/${database}`,
    host,
    port: parseInt(port, 10),
    database,
    user,
    password: password || undefined,
    ssl,
    dbType
  })

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
    } catch (error) {
      setTestResult('error')
      setTestError(error instanceof Error ? error.message : 'Unknown error')
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
          handleClose()
        } else {
          setTestResult('error')
          setTestError(result.error || 'Failed to save connection')
        }
      }
    } catch (error) {
      setTestResult('error')
      setTestError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsSaving(false)
    }
  }

  const isValid =
    inputMode === 'connection-string'
      ? connectionString && !parseError && host && port && database && user
      : host && port && database && user

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col">
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
            <div className="flex rounded-lg border bg-muted p-1">
              <button
                type="button"
                onClick={() => handleDbTypeChange('postgresql')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  dbType === 'mysql'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MySQLIcon className="size-4" />
                MySQL
              </button>
            </div>
          </div>

          {/* Input Mode Toggle */}
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

          {inputMode === 'connection-string' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="connection-string" className="text-sm font-medium">
                Connection String
              </label>
              <Input
                id="connection-string"
                placeholder={
                  dbType === 'mysql'
                    ? 'mysql://user:password@host:3306/database'
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
                </label>
                <Input
                  id="user"
                  placeholder="postgres"
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
            </>
          )}

          {testResult && (
            <div
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
