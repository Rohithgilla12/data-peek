import * as React from 'react'
import {
  CaretDownIcon,
  CaretUpIcon,
  ClockIcon,
  ExternalLinkIcon,
  TableIcon
} from '@/components/icons'
import { Button, cn } from '@data-peek/ui'

interface AIQueryResultProps {
  columns: Array<{ name: string; type: string }>
  rows: Record<string, unknown>[]
  totalRows: number
  duration: number
  onOpenInTab: () => void
}

export function AIQueryResult({
  columns,
  rows,
  totalRows,
  duration,
  onOpenInTab
}: AIQueryResultProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)

  const displayRows = rows.slice(0, 5)
  const hasMore = rows.length > 5 || totalRows > rows.length

  // Format cell value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  // Truncate long values
  const truncateValue = (value: string, maxLength = 30): string => {
    if (value.length <= maxLength) return value
    return value.slice(0, maxLength) + '...'
  }

  return (
    <div className={cn('mt-2 rounded-xl overflow-hidden', 'bg-card', 'border border-border')}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <TableIcon className="size-3.5 text-success" />
            <span className="text-[11px] font-medium text-foreground">
              {totalRows} row{totalRows !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ClockIcon className="size-3" />
            {duration}ms
          </div>
        </div>

        <div className="flex items-center gap-2">
          {displayRows.length > 3 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <>
                  <CaretUpIcon className="size-3" />
                  Collapse
                </>
              ) : (
                <>
                  <CaretDownIcon className="size-3" />
                  Expand
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className={cn(
          'overflow-x-auto',
          !isExpanded && displayRows.length > 3 && 'max-h-[100px] overflow-hidden'
        )}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.slice(0, 6).map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  <div className="flex flex-col">
                    <span>{col.name}</span>
                    <span className="text-[9px] font-normal text-muted-foreground">{col.type}</span>
                  </div>
                </th>
              ))}
              {columns.length > 6 && (
                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  +{columns.length - 6} more
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-border hover:bg-muted transition-colors',
                  rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'
                )}
              >
                {columns.slice(0, 6).map((col) => {
                  const value = formatValue(row[col.name])
                  const isNull = value === 'NULL'

                  return (
                    <td
                      key={col.name}
                      className={cn(
                        'px-3 py-1.5 font-mono whitespace-nowrap',
                        isNull ? 'text-muted-foreground italic' : 'text-foreground'
                      )}
                    >
                      {truncateValue(value)}
                    </td>
                  )
                })}
                {columns.length > 6 && <td className="px-3 py-1.5 text-muted-foreground">...</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Gradient fade when collapsed */}
        {!isExpanded && displayRows.length > 3 && (
          <div className="absolute bottom-10 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>

      {/* Footer */}
      {hasMore && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/40">
          <span className="text-[10px] text-muted-foreground">
            Showing {displayRows.length} of {totalRows} rows
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onOpenInTab}
          >
            <ExternalLinkIcon className="size-3" />
            View All Results
          </Button>
        </div>
      )}
    </div>
  )
}
