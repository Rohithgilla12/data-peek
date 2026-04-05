'use client'

import { X, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'

interface ColumnStatsPanelProps {
  schema: string
  table: string
  column: string
  dataType: string
  onClose: () => void
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/50 px-3 py-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-mono font-semibold">{value}</span>
    </div>
  )
}

export function ColumnStatsPanel({
  schema,
  table,
  column,
  dataType,
  onClose,
}: ColumnStatsPanelProps) {
  const { activeConnectionId } = useConnectionStore()

  const { data, isLoading, error } = trpc.columnStats.get.useQuery(
    {
      connectionId: activeConnectionId!,
      schema,
      table,
      column,
      dataType,
    },
    { enabled: !!activeConnectionId }
  )

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold font-mono">{column}</span>
          <span className="text-[10px] text-muted-foreground">
            {schema}.{table} &middot; {dataType}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive px-2 py-4">{error.message}</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Total Rows" value={data.totalRows.toLocaleString()} />
              <StatBox label="Distinct" value={`${data.distinctCount.toLocaleString()} (${data.distinctPercent}%)`} />
              <StatBox label="Nulls" value={`${data.nullCount.toLocaleString()} (${data.nullPercent}%)`} />
              {data.min !== undefined && <StatBox label="Min" value={data.min} />}
              {data.max !== undefined && <StatBox label="Max" value={data.max} />}
              {data.avg !== undefined && <StatBox label="Avg" value={data.avg} />}
            </div>

            {data.topValues && data.topValues.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Top Values
                </h3>
                <div className="space-y-1.5">
                  {data.topValues.map((tv, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono truncate max-w-[60%]" title={tv.value}>
                          {tv.value}
                        </span>
                        <span className="text-muted-foreground">
                          {tv.count.toLocaleString()} ({tv.percent}%)
                        </span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-muted">
                        <div
                          className="h-1 rounded-full bg-accent transition-all"
                          style={{ width: `${tv.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
