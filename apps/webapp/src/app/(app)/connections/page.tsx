'use client'

import { trpc } from '@/lib/trpc-client'
import { ConnectionCard } from '@/components/connections/connection-card'
import { AddConnectionDialog } from '@/components/connections/add-connection-dialog'

export default function ConnectionsPage() {
  const { data: connections, isLoading } = trpc.connections.list.useQuery()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">Connections</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your database connections. Credentials are encrypted at rest.
      </p>

      <div className="space-y-3">
        <AddConnectionDialog />

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {connections?.map((connection) => (
          <ConnectionCard key={connection.id} connection={connection} />
        ))}

        {connections?.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No connections yet. Add one above to get started.
          </p>
        )}
      </div>
    </div>
  )
}
