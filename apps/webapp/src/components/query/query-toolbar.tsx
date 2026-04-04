'use client'

import { Play, FileSearch, Loader2, Wand2, Square } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { ProBadge } from '@/components/upgrade/pro-badge'
import { SaveQueryDialog } from '@/components/query/save-query-dialog'
import { useConnectionStore } from '@/stores/connection-store'

interface QueryToolbarProps {
  onExecute: () => void
  onExplain: () => void
  isExecuting: boolean
}

export function QueryToolbar({ onExecute, onExplain, isExecuting }: QueryToolbarProps) {
  const { data: usage } = trpc.usage.current.useQuery()
  const { data: connections } = trpc.connections.list.useQuery()
  const { activeConnectionId } = useConnectionStore()
  const activeConn = connections?.find((c) => c.id === activeConnectionId)

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border bg-muted/30 shrink-0">
      {/* Run / Cancel button */}
      <button
        onClick={onExecute}
        disabled={isExecuting}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 hover:shadow-[0_0_12px_oklch(0.62_0.15_250/0.3)] transition-all duration-200 press-effect disabled:opacity-50"
      >
        {isExecuting ? (
          <>
            <Square className="h-3 w-3 fill-current" />
            Cancel
          </>
        ) : (
          <>
            <Play className="h-3 w-3" />
            Run
            <kbd className="ml-1 text-[10px] opacity-60">&#8984;&#8629;</kbd>
          </>
        )}
      </button>

      {/* Explain */}
      {usage?.plan === 'free' ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Explain</span>
          <ProBadge feature="EXPLAIN Plans" />
        </div>
      ) : (
        <button
          onClick={onExplain}
          disabled={isExecuting}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <FileSearch className="h-3 w-3" />
          Explain
        </button>
      )}

      {/* Separator */}
      <div className="h-4 w-px bg-border mx-1" />

      {/* Format — TODO: wire up sql-formatter */}
      <button
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Format SQL (coming soon)"
        disabled
      >
        <Wand2 className="h-3 w-3" />
        Format
      </button>

      {/* Save */}
      <SaveQueryDialog />

      {/* Right side — connection indicator */}
      {activeConn && (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-success" />
          {activeConn.name}
        </div>
      )}
    </div>
  )
}
