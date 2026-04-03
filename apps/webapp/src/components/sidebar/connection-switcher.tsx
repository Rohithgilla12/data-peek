'use client'

import { ChevronDown } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'

export function ConnectionSwitcher() {
  const { data: connections, isLoading } = trpc.connections.list.useQuery()
  const { activeConnectionId, setActiveConnection } = useConnectionStore()

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-9 rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  const active = connections?.find((c) => c.id === activeConnectionId)

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <select
          value={activeConnectionId ?? ''}
          onChange={(e) => setActiveConnection(e.target.value || null)}
          className="w-full appearance-none rounded-md border border-border bg-input px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Select connection...</option>
          {connections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.dbType})
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {active && (
        <div className="mt-1.5 flex items-center gap-1.5 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-xs text-muted-foreground">{active.environment}</span>
        </div>
      )}
    </div>
  )
}
