import { cn } from '@data-peek/ui'
import { ShareImageDialog, type ShareImageTheme } from '@/components/share-image-dialog'
import type { QueryResult } from '@/stores/query-store'
import type { ConnectionConfig } from '@data-peek/shared'

interface ShareResultsImageProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: QueryResult | null
  connection: ConnectionConfig | null | undefined
}

/**
 * Wraps ShareImageDialog with a themed table render of the current query results,
 * capped at 25 rows / 10 columns for a shareable image.
 */
export function ShareResultsImage({
  open,
  onOpenChange,
  result,
  connection
}: ShareResultsImageProps) {
  return (
    <ShareImageDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Results"
      description="Generate a shareable image of your query results. Review data before sharing — the image may contain sensitive values."
      filenamePrefix="query-results"
    >
      {(theme: ShareImageTheme) => {
        if (!result || result.columns.length === 0) {
          const mutedColor = theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'
          return <p className={cn('py-4 text-center text-xs', mutedColor)}>No results to share</p>
        }

        const textColor = theme === 'light' ? 'text-zinc-800' : 'text-zinc-100'
        const mutedColor = theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'
        const headerColor = theme === 'light' ? 'text-zinc-700' : 'text-zinc-300'
        const borderColor = theme === 'light' ? 'border-zinc-200' : 'border-zinc-700'
        const maxRows = 25
        const visibleRows = result.rows.slice(0, maxRows)
        const visibleCols = result.columns.slice(0, 10)
        const connLabel = connection?.name || connection?.host || ''

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className={cn('text-sm font-semibold', textColor)}>
                  {result.tableName || 'Query Results'}
                </p>
                <p className={cn('text-xs', mutedColor)}>
                  {result.rowCount} rows &middot; {result.durationMs}ms
                </p>
              </div>
              {connLabel && <p className={cn('text-xs', mutedColor)}>{connLabel}</p>}
            </div>
            <div className="overflow-hidden">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className={cn(borderColor)} style={{ borderBottom: '1px solid' }}>
                    {visibleCols.map((col) => (
                      <th
                        key={col.name}
                        className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}
                      >
                        {col.name}
                      </th>
                    ))}
                    {result.columns.length > 10 && (
                      <th className={cn('py-1.5 text-left font-medium', mutedColor)}>
                        +{result.columns.length - 10} more
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className={cn(borderColor)}
                      style={{ borderBottom: '1px solid' }}
                    >
                      {visibleCols.map((col) => {
                        const val = row[col.name]
                        const display =
                          val === null
                            ? 'NULL'
                            : typeof val === 'object'
                              ? JSON.stringify(val)
                              : String(val)
                        return (
                          <td
                            key={col.name}
                            className={cn(
                              'max-w-[200px] truncate py-1.5 pr-3 font-mono',
                              val === null ? mutedColor : textColor
                            )}
                          >
                            {display.length > 50 ? display.slice(0, 50) + '...' : display}
                          </td>
                        )
                      })}
                      {result.columns.length > 10 && (
                        <td className={cn('py-1.5 pr-3', mutedColor)}>...</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > maxRows && (
                <p className={cn('mt-2 text-xs', mutedColor)}>
                  Showing {maxRows} of {result.rows.length} rows
                </p>
              )}
            </div>
          </div>
        )
      }}
    </ShareImageDialog>
  )
}
