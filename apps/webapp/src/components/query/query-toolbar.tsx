'use client'

import { Play, FileSearch, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { ProBadge } from '@/components/upgrade/pro-badge'

interface QueryToolbarProps {
  onExecute: () => void
  onExplain: () => void
  isExecuting: boolean
}

export function QueryToolbar({ onExecute, onExplain, isExecuting }: QueryToolbarProps) {
  const { data: usage } = trpc.usage.current.useQuery()

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border">
      <button
        onClick={onExecute}
        disabled={isExecuting}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {isExecuting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        Run
        <kbd className="ml-1 text-[10px] opacity-60">&#8984;&#8629;</kbd>
      </button>
      {usage?.plan === 'free' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Explain</span>
          <ProBadge feature="EXPLAIN Plans" />
        </div>
      ) : (
        <button
          onClick={onExplain}
          disabled={isExecuting}
          className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <FileSearch className="h-3 w-3" />
          Explain
        </button>
      )}
    </div>
  )
}
