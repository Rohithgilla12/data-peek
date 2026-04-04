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
  if (isExecuting) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border text-xs animate-fade-in">
        <Loader2 className="h-3 w-3 animate-spin text-accent" />
        <span className="text-muted-foreground">Executing...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border text-xs animate-shake">
        <XCircle className="h-3 w-3 text-destructive" />
        <span className="text-destructive truncate">{error}</span>
      </div>
    )
  }

  if (rowCount !== null) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border text-xs animate-slide-up">
        <CheckCircle className="h-3 w-3 text-success animate-check-pop" />
        <span className="text-success">
          {rowCount.toLocaleString()} row{rowCount !== 1 ? 's' : ''}
        </span>
        {durationMs !== null && (
          <span className="text-muted-foreground">&middot; {durationMs}ms</span>
        )}
        {rows && fields && rows.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => downloadCSV(rows, fields)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={() => downloadJSON(rows)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Download className="h-3 w-3" />
              JSON
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}
