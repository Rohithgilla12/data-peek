import { cn } from '@data-peek/ui'
import type { AskResult } from '@/lib/ask-session'

const MAX_ROWS = 200
const NUMERIC = /int|numeric|decimal|float|double|real|money|serial/i

function formatCell(value: unknown): string {
  if (value instanceof Date)
    return value
      .toISOString()
      .replace('T', ' ')
      .replace(/\.000Z$/, 'Z')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function AskGrid({ result }: { result: AskResult }) {
  const rows = result.rows.slice(0, MAX_ROWS)
  if (result.columns.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Statement finished.</p>
  }
  if (rows.length === 0 && result.rowCount > 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Rows aren&apos;t kept after a restart. Run it again to see them.
      </p>
    )
  }
  const numeric = result.columns.map(
    (c) => NUMERIC.test(c.type) || (!c.type && typeof rows[0]?.[c.name] === 'number')
  )
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full border-collapse font-mono text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="w-10 border-b border-border/60 px-2 py-1.5 text-right font-normal text-muted-foreground/50">
              #
            </th>
            {result.columns.map((c, i) => (
              <th
                key={c.name + i}
                className={cn(
                  'whitespace-nowrap border-b border-border/60 px-3 py-1.5 font-medium text-muted-foreground',
                  numeric[i] ? 'text-right' : 'text-left'
                )}
              >
                {c.name}
                {c.type && (
                  <span className="ml-1.5 font-normal text-muted-foreground/40">{c.type}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="hover:bg-muted/40">
              <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground/40">
                {r + 1}
              </td>
              {result.columns.map((c, i) => {
                const value = row[c.name]
                return (
                  <td
                    key={c.name + i}
                    className={cn(
                      'max-w-[360px] truncate whitespace-nowrap border-b border-border/30 px-3 py-1',
                      numeric[i] && 'text-right'
                    )}
                    title={value == null ? undefined : formatCell(value)}
                  >
                    {value == null ? (
                      <span className="text-muted-foreground/40 italic">null</span>
                    ) : (
                      formatCell(value)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rowCount > rows.length && (
        <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
          Showing {rows.length} of {result.rowCount.toLocaleString()}. Open in the editor for the
          full grid.
        </p>
      )}
    </div>
  )
}
