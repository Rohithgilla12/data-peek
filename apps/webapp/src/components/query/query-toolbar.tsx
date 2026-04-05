'use client'

import { Play, FileSearch, Wand2, Square } from 'lucide-react'
import { Button } from '@data-peek/ui'
import { trpc } from '@/lib/trpc-client'
import { ProBadge } from '@/components/upgrade/pro-badge'
import { SaveQueryDialog } from '@/components/query/save-query-dialog'
import { useConnectionStore } from '@/stores/connection-store'

interface QueryToolbarProps {
  onExecute: () => void
  onExplain: () => void
  onFormat: () => void
  onCancel: () => void
  isExecuting: boolean
}

export function QueryToolbar({ onExecute, onExplain, onFormat, onCancel, isExecuting }: QueryToolbarProps) {
  const { data: usage } = trpc.usage.current.useQuery()
  const { data: connections } = trpc.connections.list.useQuery()
  const { activeConnectionId } = useConnectionStore()
  const activeConn = connections?.find((c) => c.id === activeConnectionId)

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border bg-muted/30 shrink-0">
      {/* Run / Cancel button */}
      {isExecuting ? (
        <Button
          size="sm"
          onClick={onCancel}
          className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all duration-200 press-effect"
        >
          <Square className="h-3 w-3 fill-current" />
          Cancel
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={onExecute}
          className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 hover:shadow-[0_0_12px_oklch(0.62_0.15_250/0.3)] transition-all duration-200 press-effect"
        >
          <Play className="h-3 w-3" />
          Run
          <kbd className="ml-1 text-[10px] opacity-60">&#8984;&#8629;</kbd>
        </Button>
      )}

      {/* Explain */}
      {usage?.plan === 'free' ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Explain</span>
          <ProBadge feature="EXPLAIN Plans" />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onExplain}
          disabled={isExecuting}
          className="gap-1.5 text-muted-foreground"
        >
          <FileSearch className="h-3 w-3" />
          Explain
        </Button>
      )}

      {/* Separator */}
      <div className="h-4 w-px bg-border mx-1" />

      {/* Format */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onFormat}
        disabled={isExecuting}
        className="gap-1.5 text-muted-foreground"
        title="Format SQL (⌘⇧F)"
      >
        <Wand2 className="h-3 w-3" />
        Format
      </Button>

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
