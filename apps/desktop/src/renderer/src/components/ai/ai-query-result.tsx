import * as React from 'react'
import { ExternalLink, Clock, Table2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
    <div
      className={cn(
        'mt-2 rounded-xl overflow-hidden',
        'bg-gradient-to-b from-zinc-900/60 to-zinc-900/40',
        'border border-zinc-800/60'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/30 bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Table2 className="size-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium text-zinc-300">
              {totalRows} row{totalRows !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Clock className="size-3" />
            {duration}ms
          </div>
        </div>

        <div className="flex items-center gap-2">
          {displayRows.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
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
            <tr className="border-b border-zinc-800/30 bg-zinc-900/30">
              {columns.slice(0, 6).map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-1.5 text-left font-medium text-zinc-400 whitespace-nowrap"
                >
                  <div className="flex flex-col">
                    <span>{col.name}</span>
                    <span className="text-[9px] font-normal text-zinc-600">{col.type}</span>
                  </div>
                </th>
              ))}
              {columns.length > 6 && (
                <th className="px-3 py-1.5 text-left font-medium text-zinc-500 whitespace-nowrap">
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
                  'border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors',
                  rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-zinc-900/20'
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
                        isNull ? 'text-zinc-600 italic' : 'text-zinc-300'
                      )}
                    >
                      {truncateValue(value)}
                    </td>
                  )
                })}
                {columns.length > 6 && <td className="px-3 py-1.5 text-zinc-600">...</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Gradient fade when collapsed */}
        {!isExpanded && displayRows.length > 3 && (
          <div className="absolute bottom-10 left-0 right-0 h-6 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Footer */}
      {hasMore && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/30 bg-zinc-900/30">
          <span className="text-[10px] text-zinc-500">
            Showing {displayRows.length} of {totalRows} rows
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
            onClick={onOpenInTab}
          >
            <ExternalLink className="size-3" />
            View All Results
          </Button>
        </div>
      )}
    </div>
  )
}
