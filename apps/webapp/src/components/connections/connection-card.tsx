'use client'

import { Database, Trash2, Plug, Clock } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'

interface ConnectionCardProps {
  connection: {
    id: string
    name: string
    dbType: string
    environment: string
    sslEnabled: boolean
    lastConnectedAt: string | null
    createdAt: string
  }
}

export function ConnectionCard({ connection }: ConnectionCardProps) {
  const utils = trpc.useUtils()
  const { setActiveConnection } = useConnectionStore()

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: () => utils.connections.list.invalidate(),
  })

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => utils.connections.list.invalidate(),
  })

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10">
            <Database className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{connection.name}</h3>
            <p className="text-xs text-muted-foreground">
              {connection.dbType} · {connection.environment}
              {connection.sslEnabled && ' · SSL'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setActiveConnection(connection.id)
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Use this connection"
          >
            <Plug className="h-4 w-4" />
          </button>
          <button
            onClick={() => testMutation.mutate({ id: connection.id })}
            disabled={testMutation.isPending}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="Test connection"
          >
            {testMutation.isPending ? (
              <Clock className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this connection?')) {
                deleteMutation.mutate({ id: connection.id })
              }
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/80 hover:text-foreground transition-colors"
            title="Delete connection"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {testMutation.data && (
        <div
          className={`mt-3 rounded-md px-3 py-1.5 text-xs ${
            testMutation.data.success
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {testMutation.data.message}
        </div>
      )}
    </div>
  )
}
