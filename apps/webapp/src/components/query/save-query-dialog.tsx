'use client'

import { useState } from 'react'
import { Bookmark, X } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'
import { ProBadge } from '@/components/upgrade/pro-badge'

export function SaveQueryDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId } = useQueryStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const utils = trpc.useUtils()
  const { data: usage } = trpc.usage.current.useQuery()

  const saveMutation = trpc.savedQueries.create.useMutation({
    onSuccess: () => {
      utils.savedQueries.list.invalidate()
      setOpen(false)
      setName('')
      setDescription('')
    },
  })

  if (!open) {
    if (
      usage?.plan === 'free' &&
      (usage?.usage.savedQueriesUsed ?? 0) >= (usage?.limits.savedQueries ?? 10)
    ) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Save</span>
          <ProBadge feature="Unlimited Saved Queries" />
        </div>
      )
    }

    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!activeTab?.sql.trim() || !activeConnectionId}
        className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-50"
        title="Save query"
      >
        <Bookmark className="h-3 w-3" />
        Save
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Query name..."
        className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40"
        autoFocus
      />
      <button
        onClick={() => {
          if (!activeConnectionId || !activeTab?.sql || !name.trim()) return
          saveMutation.mutate({
            connectionId: activeConnectionId,
            name: name.trim(),
            query: activeTab.sql,
            description: description || undefined,
          })
        }}
        disabled={!name.trim() || saveMutation.isPending}
        className="rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
      >
        {saveMutation.isPending ? '...' : 'Save'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
