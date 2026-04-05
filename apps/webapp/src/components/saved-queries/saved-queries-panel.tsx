'use client'

import { useState } from 'react'
import { Play, Trash2, Search } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'

export function SavedQueriesPanel() {
  const [search, setSearch] = useState('')
  const { activeConnectionId } = useConnectionStore()
  const { activeTabId, updateSql } = useQueryStore()
  const utils = trpc.useUtils()

  const { data: queries, isLoading } = trpc.savedQueries.list.useQuery(
    { connectionId: activeConnectionId ?? undefined, search: search || undefined },
    { enabled: !!activeConnectionId }
  )

  const deleteMutation = trpc.savedQueries.delete.useMutation({
    onSuccess: () => utils.savedQueries.list.invalidate(),
  })

  const incrementMutation = trpc.savedQueries.incrementUsage.useMutation()

  if (!activeConnectionId) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">Select a connection first</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved queries..."
            className="w-full rounded-md border border-border bg-input pl-7 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
        )}
        {queries?.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No saved queries
          </div>
        )}
        {queries?.map((q) => (
          <div key={q.id} className="group px-3 py-2 border-b border-border/30 hover:bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground truncate">{q.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    updateSql(activeTabId, q.query)
                    incrementMutation.mutate({ id: q.id })
                  }}
                  className="p-1 rounded text-muted-foreground hover:text-accent"
                  title="Load into editor"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: q.id })}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="mt-1 text-[10px] text-muted-foreground truncate font-mono">
              {q.query}
            </pre>
            {q.description && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">{q.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
