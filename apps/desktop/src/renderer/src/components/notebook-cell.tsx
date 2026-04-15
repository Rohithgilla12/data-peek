import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Play, MoreHorizontal, GripVertical, Check, X, Pin, PinOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn
} from '@data-peek/ui'
import type { NotebookCell as CellType, PinnedResult } from '@shared/index'
import { useNotebookStore } from '@/stores/notebook-store'
import { useConnectionStore } from '@/stores/connection-store'

interface NotebookCellProps {
  cell: CellType
  connectionId: string
  isFocused: boolean
  onFocus: () => void
  onRunAndAdvance: () => void
  onDelete: () => void
}

interface QueryResult {
  fields: { name: string }[]
  rows: Record<string, unknown>[]
}

const MAX_DISPLAY_ROWS = 100

function ResultTable({ result }: { result: QueryResult }) {
  const columns = result.fields.map((f) => f.name)
  const rows = result.rows.slice(0, MAX_DISPLAY_ROWS)
  const isTruncated = result.rows.length > MAX_DISPLAY_ROWS

  if (columns.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Query executed successfully.</p>
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/30 hover:bg-muted/20">
              {columns.map((col, ci) => {
                const cell = row[col]
                return (
                  <td
                    key={ci}
                    className="px-2 py-1 font-mono whitespace-nowrap max-w-[300px] truncate"
                  >
                    {cell === null || cell === undefined ? (
                      <span className="italic text-muted-foreground/50">null</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {isTruncated && (
        <p className="text-[10px] text-muted-foreground px-2 py-1.5 border-t border-border/30">
          Showing {MAX_DISPLAY_ROWS} of {result.rows.length} rows
        </p>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: 'idle' | 'running' | 'success' | 'error' }) {
  if (status === 'idle') return null
  if (status === 'running')
    return <span className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
  if (status === 'success')
    return <Check className="size-3 text-emerald-500 shrink-0" />
  return <X className="size-3 text-destructive shrink-0" />
}

export const NotebookCell = memo(function NotebookCell({
  cell,
  connectionId,
  isFocused,
  onFocus,
  onRunAndAdvance,
  onDelete
}: NotebookCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [liveResult, setLiveResult] = useState<QueryResult | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateCellContent = useNotebookStore((s) => s.updateCellContent)
  const flushCellContent = useNotebookStore((s) => s.flushCellContent)
  const pinResult = useNotebookStore((s) => s.pinResult)
  const unpinResult = useNotebookStore((s) => s.unpinResult)
  const connections = useConnectionStore((s) => s.connections)

  const activeConnection = connections.find((c) => c.id === connectionId) ?? null

  useEffect(() => {
    if (isEditing && isFocused && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing, isFocused])

  useEffect(() => {
    if (!isFocused) {
      setIsEditing(false)
    }
  }, [isFocused])

  const handleContentChange = useCallback(
    (value: string) => {
      updateCellContent(cell.id, value)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        flushCellContent(cell.id, value)
      }, 500)
    },
    [cell.id, updateCellContent, flushCellContent]
  )

  const runQuery = useCallback(async () => {
    if (!activeConnection || cell.type !== 'sql' || !cell.content.trim()) return

    setStatus('running')
    setLiveError(null)
    const start = Date.now()

    try {
      const result = await window.api.db.query(activeConnection, cell.content)
      const elapsed = Date.now() - start
      setDurationMs(elapsed)

      if (result.success && result.data) {
        setLiveResult(result.data as QueryResult)
        setStatus('success')
      } else {
        setLiveError(result.error ?? 'Query failed')
        setStatus('error')
      }
    } catch (err) {
      setDurationMs(Date.now() - start)
      setLiveError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [activeConnection, cell.content, cell.type])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditing(false)
        return
      }

      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        runQuery().then(() => onRunAndAdvance())
        return
      }

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        runQuery()
        return
      }
    },
    [runQuery, onRunAndAdvance]
  )

  const handlePinResult = useCallback(() => {
    if (!liveResult) return
    const pinned: PinnedResult = {
      columns: liveResult.fields.map((f) => f.name),
      rows: liveResult.rows,
      rowCount: liveResult.rows.length,
      executedAt: Date.now(),
      durationMs: durationMs ?? 0,
      error: null
    }
    pinResult(cell.id, pinned)
  }, [cell.id, liveResult, durationMs, pinResult])

  const handleUnpinResult = useCallback(() => {
    unpinResult(cell.id)
  }, [cell.id, unpinResult])

  const pinnedResult = cell.pinnedResult
  const hasPinnedResult = pinnedResult !== null && pinnedResult !== undefined

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all duration-150',
        'border-border/50 bg-card',
        isFocused && 'border-primary/30 shadow-[0_0_0_1px_oklch(0.55_0.15_250/0.3)]'
      )}
      onClick={onFocus}
    >
      {status === 'running' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg overflow-hidden">
          <div className="h-full bg-primary animate-[shimmer_1.5s_ease-in-out_infinite] w-1/3" />
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/30">
        <GripVertical
          className={cn(
            'size-3.5 text-muted-foreground/40 shrink-0 cursor-grab',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
        />

        <span
          className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded font-mono uppercase tracking-wide',
            cell.type === 'sql'
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground bg-muted/50'
          )}
        >
          {cell.type === 'sql' ? 'SQL' : 'MD'}
        </span>

        <StatusIcon status={status} />

        {durationMs !== null && status !== 'running' && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`}
          </span>
        )}

        {liveResult && status === 'success' && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {liveResult.rows.length} row{liveResult.rows.length !== 1 ? 's' : ''}
          </span>
        )}

        <div className="flex-1" />

        {cell.type === 'sql' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={status === 'running' || !activeConnection}
            onClick={(e) => {
              e.stopPropagation()
              runQuery()
            }}
          >
            <Play className="size-3" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {cell.type === 'sql' && liveResult && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handlePinResult()
                }}
              >
                <Pin className="size-3.5 mr-2" />
                Pin result
              </DropdownMenuItem>
            )}
            {cell.type === 'sql' && hasPinnedResult && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleUnpinResult()
                }}
              >
                <PinOff className="size-3.5 mr-2" />
                Unpin result
              </DropdownMenuItem>
            )}
            {cell.type === 'sql' && (liveResult || hasPinnedResult) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <X className="size-3.5 mr-2" />
              Delete cell
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3">
        {cell.type === 'sql' ? (
          isEditing && isFocused ? (
            <textarea
              ref={textareaRef}
              value={cell.content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="SELECT * FROM ..."
              className={cn(
                'w-full min-h-[80px] resize-y font-mono text-sm bg-transparent outline-none',
                'placeholder:text-muted-foreground/40 text-foreground'
              )}
              rows={Math.max(3, cell.content.split('\n').length)}
            />
          ) : (
            <pre
              className={cn(
                'font-mono text-sm text-foreground whitespace-pre-wrap break-all cursor-text min-h-[1.5rem]',
                !cell.content && 'text-muted-foreground/40 italic'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onFocus()
                setIsEditing(true)
              }}
            >
              {cell.content || 'Click to edit SQL…'}
            </pre>
          )
        ) : isEditing && isFocused ? (
          <textarea
            ref={textareaRef}
            value={cell.content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setIsEditing(false)
              }
            }}
            placeholder="Write markdown here…"
            className={cn(
              'w-full min-h-[80px] resize-y text-sm bg-transparent outline-none',
              'placeholder:text-muted-foreground/40 text-foreground'
            )}
            rows={Math.max(3, cell.content.split('\n').length)}
          />
        ) : (
          <div
            className={cn(
              'prose prose-sm dark:prose-invert max-w-none cursor-text min-h-[1.5rem]',
              !cell.content && 'text-muted-foreground/40 italic text-sm'
            )}
            onClick={(e) => {
              e.stopPropagation()
              onFocus()
              setIsEditing(true)
            }}
          >
            {cell.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.content}</ReactMarkdown>
            ) : (
              'Click to edit markdown…'
            )}
          </div>
        )}
      </div>

      {cell.type === 'sql' && (
        <div className="border-t border-border/30">
          {liveError && (
            <div className="px-3 py-2">
              <p className="text-xs text-destructive font-mono">{liveError}</p>
            </div>
          )}

          {!liveError && liveResult && (
            <div className="px-1 py-1">
              <ResultTable result={liveResult} />
            </div>
          )}

          {!liveError && !liveResult && hasPinnedResult && (
            <div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/20">
                <Pin className="size-3 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground">
                  Pinned — ran {new Date(pinnedResult.executedAt).toLocaleString()}
                  {pinnedResult.durationMs
                    ? ` · ${pinnedResult.durationMs < 1000 ? `${pinnedResult.durationMs}ms` : `${(pinnedResult.durationMs / 1000).toFixed(2)}s`}`
                    : ''}
                </span>
              </div>
              <div className="px-1 py-1">
                <ResultTable
                  result={{
                    fields: pinnedResult.columns.map((c) => ({ name: c })),
                    rows: pinnedResult.rows as unknown[][]
                  }}
                />
              </div>
            </div>
          )}

          {!liveError && !liveResult && !hasPinnedResult && status === 'idle' && (
            <div className="px-3 py-2">
              <p className="text-[10px] text-muted-foreground/50">
                Not yet executed — ⇧⏎ to run
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
