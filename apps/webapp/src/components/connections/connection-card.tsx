'use client'

import { Database, Trash2, Plug, Clock } from 'lucide-react'
import { Button, Badge } from '@data-peek/ui'
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
    <div className="rounded-lg border border-border bg-muted/30 p-4 animate-fade-in transition-all duration-200 hover:border-border/80 hover:bg-muted/40">
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
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={() => {
              setActiveConnection(connection.id)
            }}
            title="Use this connection"
          >
            <Plug className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={() => testMutation.mutate({ id: connection.id })}
            disabled={testMutation.isPending}
            title="Test connection"
          >
            {testMutation.isPending ? (
              <Clock className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-destructive/80 hover:text-foreground"
            onClick={() => {
              if (confirm('Delete this connection?')) {
                deleteMutation.mutate({ id: connection.id })
              }
            }}
            title="Delete connection"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {testMutation.data && (
        <Badge
          variant="outline"
          className={`mt-3 w-full justify-start rounded-md px-3 py-1.5 text-xs ${
            testMutation.data.success
              ? 'border-success/30 bg-success/10 text-success animate-slide-up'
              : 'border-destructive/30 bg-destructive/10 text-destructive animate-shake'
          }`}
        >
          {testMutation.data.message}
        </Badge>
      )}
    </div>
  )
}
