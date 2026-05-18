import * as React from 'react'
import { ArrowDownToLine, ArrowRight, Copy, Link2, X } from 'lucide-react'
import { Badge, Button, cn } from '@data-peek/ui'
import { Kbd } from '@/components/ui/kbd'
import { getTypeColor } from '@/lib/type-colors'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import type { CellPosition } from './cell-grid-types'

interface CellInspectorProps {
  pos: CellPosition
  value: unknown
  columnName: string
  dataType: string
  /** Total rows/cols — used for the position pill and to clamp the move buttons at edges. */
  rowCount: number
  colCount: number
  /** When present, exposes a "Follow" action that calls onNavigate(). */
  foreignKey?: { onNavigate: () => void }
  onClose: () => void
  onMove?: (drow: number, dcol: number) => void
}

function formatValue(value: unknown): { display: string; isNull: boolean; kind: string } {
  if (value === null || value === undefined) {
    return { display: 'NULL', isNull: true, kind: 'null' }
  }
  if (typeof value === 'boolean') {
    return { display: value ? 'true' : 'false', isNull: false, kind: 'boolean' }
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return { display: String(value), isNull: false, kind: 'number' }
  }
  if (value instanceof Date) {
    return { display: value.toISOString(), isNull: false, kind: 'date' }
  }
  if (typeof value === 'object') {
    try {
      return { display: JSON.stringify(value, null, 2), isNull: false, kind: 'json' }
    } catch {
      return { display: String(value), isNull: false, kind: 'object' }
    }
  }
  return { display: String(value), isNull: false, kind: 'string' }
}

function bytesOf(s: string): number {
  return new TextEncoder().encode(s).length
}

export function CellInspector({
  pos,
  value,
  columnName,
  dataType,
  rowCount,
  colCount,
  foreignKey,
  onClose,
  onMove
}: CellInspectorProps) {
  const { copy, copied } = useCopyToClipboard()
  const formatted = React.useMemo(() => formatValue(value), [value])
  const charLength = formatted.isNull ? 0 : formatted.display.length
  const byteLength = formatted.isNull ? 0 : bytesOf(formatted.display)

  const handleCopy = React.useCallback(() => {
    if (formatted.isNull) return
    copy(formatted.display)
  }, [copy, formatted])

  return (
    <div
      data-cell-inspector
      role="region"
      aria-label={`Cell inspector for ${columnName}`}
      className={cn(
        'cell-inspector-panel',
        'absolute inset-x-3 bottom-3 z-30',
        'flex flex-col overflow-hidden',
        'rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md',
        'shadow-[0_8px_32px_-12px_rgb(0_0_0/0.32),0_0_0_1px_oklch(0.65_0.15_250/0.18)]',
        'text-popover-foreground'
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
            R{pos.row + 1}
            <span className="text-muted-foreground/40">·</span>C{pos.col + 1}
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground/60">
              {rowCount}×{colCount}
            </span>
          </span>
          <span className="text-muted-foreground/30">/</span>
          <span className="font-mono text-[12px] font-medium truncate" title={columnName}>
            {columnName}
          </span>
          <Badge
            variant="outline"
            className={cn('h-4 px-1.5 font-mono text-[9px] uppercase', getTypeColor(dataType))}
          >
            {dataType}
          </Badge>
          {formatted.isNull && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 font-mono text-[9px] uppercase border-amber-500/40 text-amber-500"
            >
              null
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {foreignKey && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={foreignKey.onNavigate}
            >
              <Link2 className="size-3" />
              Follow
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={handleCopy}
            disabled={formatted.isNull}
          >
            <Copy className="size-3" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] divide-x divide-border/30 min-h-[88px] max-h-[280px]">
        <div className="flex flex-col gap-1.5 px-3 py-2 text-[11px] font-mono">
          <Metric label="kind" value={formatted.kind} />
          <Metric label="chars" value={String(charLength)} />
          <Metric label="bytes" value={String(byteLength)} />
        </div>
        <div className="overflow-auto px-3 py-2">
          {formatted.isNull ? (
            <span className="font-mono text-[12px] italic text-muted-foreground">NULL</span>
          ) : formatted.kind === 'json' ? (
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
              {formatted.display}
            </pre>
          ) : (
            <div className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
              {formatted.display}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/40 px-3 py-1.5 text-[10px] font-mono text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Kbd className="h-4 text-[9px]">Esc</Kbd>close
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd className="h-4 text-[9px]">⌘C</Kbd>copy
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd className="h-4 text-[9px]">↑↓</Kbd>row
            <Kbd className="h-4 text-[9px]">←→</Kbd>col
          </span>
        </div>
        {onMove && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(0, -1)}
              className="hover:text-foreground transition-colors disabled:opacity-30 inline-flex items-center"
              disabled={pos.col === 0}
              aria-label="Previous column"
            >
              <ArrowRight className="size-3 -scale-x-100" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1, 0)}
              className="hover:text-foreground transition-colors disabled:opacity-30 inline-flex items-center"
              disabled={pos.row === rowCount - 1}
              aria-label="Next row"
            >
              <ArrowDownToLine className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onMove(0, 1)}
              className="hover:text-foreground transition-colors disabled:opacity-30 inline-flex items-center"
              disabled={pos.col === colCount - 1}
              aria-label="Next column"
            >
              <ArrowRight className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground/60 uppercase tracking-wide text-[9px]">{label}</span>
      <span className="tabular-nums truncate">{value}</span>
    </div>
  )
}
