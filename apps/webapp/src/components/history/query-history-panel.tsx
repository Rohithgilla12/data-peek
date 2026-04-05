'use client'

import { useState } from 'react'
import { Play, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'

function formatRelativeTime(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(date).toLocaleDateString()
}

export function QueryHistoryPanel() {
  const [statusFilter, setStatusFilter] = useState<'success' | 'error' | undefined>()
  const { activeConnectionId } = useConnectionStore()
  const { activeTabId, updateSql } = useQueryStore()
  const utils = trpc.useUtils()

  const { data: entries, isLoading } = trpc.history.list.useQuery(
    { connectionId: activeConnectionId ?? undefined, status: statusFilter, limit: 100 },
    { enabled: !!activeConnectionId }
  )

  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => utils.history.list.invalidate(),
  })

  if (!activeConnectionId) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">Select a connection first</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`rounded px-2 py-0.5 text-[10px] ${!statusFilter ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('success')}
          className={`rounded px-2 py-0.5 text-[10px] ${statusFilter === 'success' ? 'bg-success/10 text-success' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Success
        </button>
        <button
          onClick={() => setStatusFilter('error')}
          className={`rounded px-2 py-0.5 text-[10px] ${statusFilter === 'error' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Errors
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>}
        {entries?.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No history yet</div>
        )}
        {entries?.map((entry) => (
          <div
            key={entry.id}
            className={`group px-3 py-2 border-b border-border/30 hover:bg-muted/30 ${
              entry.status === 'error' ? 'border-l-2 border-l-destructive/50' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {entry.status === 'success' ? (
                  <CheckCircle className="h-3 w-3 text-success flex-shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(entry.executedAt)}
                </span>
                {entry.durationMs && (
                  <span className="text-[10px] text-muted-foreground">
                    · {entry.durationMs}ms
                  </span>
                )}
                {entry.rowCount !== null && entry.status === 'success' && (
                  <span className="text-[10px] text-muted-foreground">
                    · {entry.rowCount} rows
                  </span>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => updateSql(activeTabId, entry.query)}
                  className="p-1 rounded text-muted-foreground hover:text-accent"
                  title="Load into editor"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: entry.id })}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="mt-1 text-[10px] text-foreground/80 truncate font-mono">
              {entry.query}
            </pre>
            {entry.errorMessage && (
              <p className="mt-1 text-[10px] text-destructive truncate">{entry.errorMessage}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
