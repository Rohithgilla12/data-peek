'use client'

import { useState } from 'react'
import { Plus, X, Link } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

function parseConnectionString(str: string): {
  dbType: 'postgresql' | 'mysql'
  host: string
  port: number
  database: string
  user: string
  password: string
  sslEnabled: boolean
} | null {
  try {
    const trimmed = str.trim()

    let dbType: 'postgresql' | 'mysql' = 'postgresql'
    if (trimmed.startsWith('mysql://')) {
      dbType = 'mysql'
    } else if (
      !trimmed.startsWith('postgresql://') &&
      !trimmed.startsWith('postgres://')
    ) {
      return null
    }

    const url = new URL(trimmed)
    const host = url.hostname
    const port = url.port
      ? parseInt(url.port)
      : dbType === 'postgresql'
        ? 5432
        : 3306
    const database = url.pathname.replace(/^\//, '')
    const user = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    const sslEnabled =
      url.searchParams.get('sslmode') === 'require' ||
      url.searchParams.get('ssl') === 'true' ||
      url.searchParams.has('sslmode')

    if (!host || !database || !user) return null

    return { dbType, host, port, database, user, password, sslEnabled }
  } catch {
    return null
  }
}

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'form' | 'url'>('url')
  const [connectionString, setConnectionString] = useState('')
  const [parseError, setParseError] = useState('')
  const utils = trpc.useUtils()

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => {
      utils.connections.list.invalidate()
      setOpen(false)
      setConnectionString('')
      setParseError('')
    },
  })

  const [form, setForm] = useState({
    name: '',
    dbType: 'postgresql' as 'postgresql' | 'mysql',
    environment: 'development' as 'production' | 'staging' | 'development' | 'local',
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: '',
    sslEnabled: false,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate(form)
  }

  function handleUrlParse() {
    const parsed = parseConnectionString(connectionString)
    if (!parsed) {
      setParseError('Invalid connection string. Expected: postgresql://user:pass@host:port/dbname')
      return
    }
    setParseError('')
    setForm((prev) => ({
      ...prev,
      ...parsed,
      name: prev.name || `${parsed.host}/${parsed.database}`,
    }))
    setMode('form')
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors w-full"
      >
        <Plus className="h-4 w-4" />
        Add Connection
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">New Connection</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === 'url' ? 'form' : 'url')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent transition-colors"
          >
            <Link className="h-3 w-3" />
            {mode === 'url' ? 'Manual' : 'URL'}
          </button>
          <button onClick={() => { setOpen(false); setMode('url'); setConnectionString(''); setParseError('') }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mode === 'url' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Connection String</label>
            <input
              type="text"
              value={connectionString}
              onChange={(e) => { setConnectionString(e.target.value); setParseError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUrlParse() } }}
              placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
              autoFocus
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Supports postgresql://, postgres://, and mysql:// URLs
            </p>
          </div>
          {parseError && <p className="text-xs text-destructive">{parseError}</p>}
          <button
            type="button"
            onClick={handleUrlParse}
            disabled={!connectionString.trim()}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            Parse & Continue
          </button>
        </div>
      )}

      {mode === 'form' && (
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="My Database"
              required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={form.dbType}
              onChange={(e) => {
                const dbType = e.target.value as 'postgresql' | 'mysql'
                updateField('dbType', dbType)
                updateField('port', dbType === 'postgresql' ? 5432 : 3306)
              }}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Host</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => updateField('host', e.target.value)}
              placeholder="localhost"
              required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => updateField('port', parseInt(e.target.value))}
              required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Database</label>
          <input
            type="text"
            value={form.database}
            onChange={(e) => updateField('database', e.target.value)}
            placeholder="mydb"
            required
            className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">User</label>
            <input
              type="text"
              value={form.user}
              onChange={(e) => updateField('user', e.target.value)}
              placeholder="postgres"
              required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Environment</label>
            <select
              value={form.environment}
              onChange={(e) => updateField('environment', e.target.value as typeof form.environment)}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
              <option value="local">Local</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.sslEnabled}
                onChange={(e) => updateField('sslEnabled', e.target.checked)}
                className="rounded border-border"
              />
              SSL
            </label>
          </div>
        </div>

        {createMutation.error && (
          <p className="text-xs text-destructive">{createMutation.error.message}</p>
        )}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {createMutation.isPending ? 'Adding...' : 'Add Connection'}
        </button>
      </form>
      )}
    </div>
  )
}
