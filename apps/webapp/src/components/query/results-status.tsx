'use client'

import { CheckCircle, XCircle, Loader2, Download } from 'lucide-react'
import { downloadCSV, downloadJSON } from '@/lib/export'

interface ResultsStatusProps {
  rowCount: number | null
  durationMs: number | null
  error: string | null
  isExecuting: boolean
  rows?: Record<string, unknown>[]
  fields?: { name: string }[]
}

export function ResultsStatus({
  rowCount,
  durationMs,
  error,
  isExecuting,
  rows,
  fields,
}: ResultsStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/30 shrink-0 text-xs">
      {isExecuting ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          <span className="text-muted-foreground">Executing query...</span>
        </>
      ) : error ? (
        <>
          <XCircle className="h-3 w-3 text-destructive" />
          <span className="text-destructive truncate flex-1">{error}</span>
        </>
      ) : rowCount !== null ? (
        <>
          <div className="h-2 w-2 rounded-full bg-success animate-fade-in" />
          <span className="text-muted-foreground">
            {rowCount.toLocaleString()} row{rowCount !== 1 ? 's' : ''} returned
          </span>
          {durationMs !== null && (
            <span className="text-muted-foreground/70">{durationMs}ms</span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground/50">Ready</span>
      )}

      {/* Right side — export buttons */}
      {rows && fields && rows.length > 0 && (
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => downloadCSV(rows, fields)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
          <button
            onClick={() => downloadJSON(rows)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
        </div>
      )}
    </div>
  )
}
