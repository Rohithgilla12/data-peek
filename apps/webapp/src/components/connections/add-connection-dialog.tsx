'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false)
  const utils = trpc.useUtils()

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => {
      utils.connections.list.invalidate()
      setOpen(false)
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
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

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
    </div>
  )
}
