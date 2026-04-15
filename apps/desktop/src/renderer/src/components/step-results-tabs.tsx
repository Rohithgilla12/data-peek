import { useState } from 'react'
import { Pin, X } from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import type { StatementResult } from '@shared/index'
import { useStepStore } from '@/stores/step-store'

interface StepResultsTabsProps {
  tabId: string
}

export function StepResultsTabs({ tabId }: StepResultsTabsProps) {
  const session = useStepStore((s) => s.sessions.get(tabId))
  const pinResult = useStepStore((s) => s.pinResult)
  const unpinResult = useStepStore((s) => s.unpinResult)

  const [selectedIndex, setSelectedIndex] = useState<'current' | number>('current')

  if (!session) return null
  if (!session.lastResult && session.pinnedResults.length === 0) return null

  const selectedResult: StatementResult | null =
    selectedIndex === 'current'
      ? session.lastResult
      : session.pinnedResults.find((p) => p.statementIndex === selectedIndex)?.result ?? null

  const currentIsPinned =
    session.lastResult &&
    session.pinnedResults.some((p) => p.statementIndex === session.lastResult!.statementIndex)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30 overflow-x-auto">
        {session.pinnedResults.map((p) => (
          <div
            key={p.statementIndex}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer group',
              selectedIndex === p.statementIndex
                ? 'bg-card text-foreground border border-border'
                : 'text-muted-foreground hover:bg-card/50'
            )}
            onClick={() => setSelectedIndex(p.statementIndex)}
          >
            <Pin className="size-2.5 text-amber-500" />
            <span>#{p.statementIndex + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                unpinResult(tabId, p.statementIndex)
                if (selectedIndex === p.statementIndex) setSelectedIndex('current')
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive"
            >
              <X className="size-2.5" />
            </button>
          </div>
        ))}
        {session.lastResult && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer',
              selectedIndex === 'current'
                ? 'bg-card text-foreground border border-primary/40'
                : 'text-muted-foreground hover:bg-card/50'
            )}
            onClick={() => setSelectedIndex('current')}
          >
            <span>Current · #{session.lastResult.statementIndex + 1}</span>
          </div>
        )}
        <div className="flex-1" />
        {session.lastResult && !currentIsPinned && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-amber-500"
            onClick={() => pinResult(tabId, session.lastResult!.statementIndex)}
          >
            <Pin className="size-3 mr-1" /> Pin
          </Button>
        )}
      </div>

      {selectedResult && (
        <div className="flex-1 overflow-auto">
          <ResultPreview result={selectedResult} />
        </div>
      )}
    </div>
  )
}

function ResultPreview({ result }: { result: StatementResult }) {
  if (result.rows.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground font-mono">
        {result.rowCount} row{result.rowCount === 1 ? '' : 's'} affected · {result.durationMs}ms
      </div>
    )
  }
  const columns = result.fields.map((f) => f.name)
  const displayRows = result.rows.slice(0, 100)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="border-b border-border/50">
            {columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-1.5 text-muted-foreground font-medium text-[10px] uppercase tracking-wider"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => (
            <tr key={i} className="border-b border-border/20">
              {columns.map((c) => {
                const val = (row as Record<string, unknown>)[c]
                return (
                  <td key={c} className="px-3 py-1 text-muted-foreground">
                    {val === null ? (
                      <span className="italic text-muted-foreground/40">null</span>
                    ) : (
                      String(val)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 100 && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground/60">
          Showing 100 of {result.rows.length} rows
        </div>
      )}
    </div>
  )
}
