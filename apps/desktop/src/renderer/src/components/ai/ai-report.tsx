import * as React from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { AIReportWidget, ConnectionConfig } from '@data-peek/shared'
import { isReadOnlySql } from '@data-peek/shared'
import { AIChart } from './ai-chart'
import { AIMetricCard } from './ai-metric-card'
import { AIQueryResult } from './ai-query-result'

interface AIReportProps {
  widgets: AIReportWidget[]
  connection?: ConnectionConfig | null
  onOpenInTab: (sql: string) => void
}

/** One report widget: runs its own read-only SQL and renders kpi/chart/table. */
function ReportWidgetView({
  widget,
  connection,
  onOpenInTab
}: {
  widget: AIReportWidget
  connection?: ConnectionConfig | null
  onOpenInTab: (sql: string) => void
}) {
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!connection) return
    if (!isReadOnlySql(widget.sql)) {
      setError('Skipped — not a read-only query')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.db
      .query(connection, widget.sql)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setRows((res.data as { rows: Record<string, unknown>[] }).rows)
        } else {
          setError(res.error || 'Query failed')
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Query failed'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [connection, widget.sql])

  if (loading) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-blue-400" />
        <span className="text-xs text-muted-foreground">{widget.title}…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-start gap-2 text-red-400">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium">{widget.title}</p>
            <p className="text-[11px] opacity-70 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    )
  }
  if (!rows) return null
  const cols = rows[0] ? Object.keys(rows[0]) : []

  if (widget.kind === 'kpi') {
    const value = rows[0] ? (Object.values(rows[0])[0] as number | string | null) : null
    return (
      <AIMetricCard metric={{ label: widget.title, value, format: widget.format ?? 'number' }} />
    )
  }

  if (widget.kind === 'chart') {
    const xKey = widget.xKey && cols.includes(widget.xKey) ? widget.xKey : cols[0]
    const usable = (widget.yKeys ?? []).filter((k) => cols.includes(k))
    const yKeys = usable.length > 0 ? usable : cols.filter((c) => c !== xKey).slice(0, 1)
    return (
      <AIChart
        chartData={{
          title: widget.title,
          chartType: widget.chartType ?? 'bar',
          data: rows,
          xKey: xKey ?? cols[0] ?? '',
          yKeys: yKeys.length ? yKeys : cols.slice(0, 1)
        }}
      />
    )
  }

  // table
  return (
    <AIQueryResult
      columns={cols.map((c) => ({ name: c, type: 'text' }))}
      rows={rows}
      totalRows={rows.length}
      duration={0}
      onOpenInTab={() => onOpenInTab(widget.sql)}
    />
  )
}

/** A small inline dashboard: KPIs in a 2-up grid, charts/tables stacked. */
export function AIReport({ widgets, connection, onOpenInTab }: AIReportProps) {
  const kpis = widgets.filter((w) => w.kind === 'kpi')
  const rest = widgets.filter((w) => w.kind !== 'kpi')
  return (
    <div className="space-y-2 mt-3">
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {kpis.map((w, i) => (
            <ReportWidgetView
              key={`kpi-${i}`}
              widget={w}
              connection={connection}
              onOpenInTab={onOpenInTab}
            />
          ))}
        </div>
      )}
      {rest.map((w, i) => (
        <ReportWidgetView
          key={`w-${i}`}
          widget={w}
          connection={connection}
          onOpenInTab={onOpenInTab}
        />
      ))}
    </div>
  )
}
