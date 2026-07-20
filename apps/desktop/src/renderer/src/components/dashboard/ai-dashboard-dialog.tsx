import * as React from 'react'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@data-peek/ui'
import type { CreateWidgetInput, WidgetConfig, WidgetLayout, SchemaInfo } from '@data-peek/shared'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useConnectionStore } from '@/stores/connection-store'

interface AIDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
}

type WidgetSpec = NonNullable<
  Awaited<ReturnType<typeof window.api.ai.generateDashboard>>['spec']
>['widgets'][number]

/**
 * "Generate a dashboard" — one prompt → the AI (grounded via the harness/MCP)
 * designs several widgets, each with verified SQL, which are pinned to the
 * current dashboard in a packed grid layout.
 */
export function AIDashboardDialog({ open, onOpenChange, dashboardId }: AIDashboardDialogProps) {
  const [prompt, setPrompt] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const addWidget = useDashboardStore((s) => s.addWidget)
  const refreshWidget = useDashboardStore((s) => s.refreshWidget)
  const updateDashboard = useDashboardStore((s) => s.updateDashboard)
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const schemas = useConnectionStore((s) => s.schemas)
  const connection = connections.find((c) => c.id === activeConnectionId) ?? null

  const reset = () => {
    setPrompt('')
    setError(null)
    setStatus('')
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (loading) return
    if (!connection) {
      setError('Select a connection first.')
      return
    }
    setLoading(true)
    setError(null)
    setStatus('Designing your dashboard — the assistant is exploring your schema…')
    try {
      const dbType = connection.dbType || 'postgresql'
      const res = await window.api.ai.generateDashboard(
        prompt.trim() || 'A business overview: key metrics and trends.',
        schemas as unknown as SchemaInfo[],
        dbType,
        connection.id
      )
      if (!res.success || !res.spec) {
        setError(res.error || 'Could not generate a dashboard.')
        return
      }
      const spec = res.spec
      if (spec.title) await updateDashboard(dashboardId, { name: spec.title })

      const layouts = packLayouts(spec.widgets)
      for (let i = 0; i < spec.widgets.length; i++) {
        const wSpec = spec.widgets[i]
        setStatus(`Adding widget ${i + 1} of ${spec.widgets.length}: ${wSpec.title}`)
        // Resolve real columns so the config points at columns that exist.
        const run = await window.api.db.query(connection, wSpec.sql)
        const rows = (run.success && (run.data as { rows?: Record<string, unknown>[] })?.rows) || []
        const cols = rows[0] ? Object.keys(rows[0]) : []
        const input: CreateWidgetInput = {
          name: wSpec.title,
          dataSource: { type: 'inline', sql: wSpec.sql, connectionId: connection.id },
          config: specToConfig(wSpec, cols),
          layout: layouts[i],
          aiGenerated: true
        }
        const created = await addWidget(dashboardId, input)
        if (created) await refreshWidget(created)
      }
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the dashboard.')
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) reset()
        if (!loading) onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-400" />
            Generate a dashboard
          </DialogTitle>
          <DialogDescription>
            Describe the dashboard you want. The assistant explores
            {connection ? ` ${connection.name}` : ' your database'}, writes the queries, and builds
            the widgets.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          autoFocus
          disabled={loading}
          placeholder="e.g. a business overview for this SaaS — signups, revenue by plan, growth"
          className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm outline-none focus:border-blue-500/50 disabled:opacity-50"
        />

        {loading && status && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {status}
          </p>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-red-400">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate dashboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Greedy 12-column packing that keeps the model's widget order. */
function packLayouts(widgets: WidgetSpec[]): WidgetLayout[] {
  const layouts: WidgetLayout[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const w of widgets) {
    const width = w.kind === 'kpi' ? 3 : w.kind === 'table' ? 12 : 6
    const height = w.kind === 'kpi' ? 2 : 4
    if (x + width > 12) {
      x = 0
      y += rowH
      rowH = 0
    }
    layouts.push({ x, y, w: width, h: height, minW: 2, minH: 2 })
    x += width
    rowH = Math.max(rowH, height)
  }
  return layouts
}

function specToConfig(spec: WidgetSpec, cols: string[]): WidgetConfig {
  if (spec.kind === 'chart' && spec.chartType && (spec.xKey || cols[0])) {
    const xKey = spec.xKey && cols.includes(spec.xKey) ? spec.xKey : cols[0]
    const wanted = (spec.yKeys ?? []).filter((k) => cols.includes(k))
    const yKeys = wanted.length ? wanted : cols.filter((c) => c !== xKey).slice(0, 1)
    return {
      widgetType: 'chart',
      chartType: spec.chartType,
      xKey,
      yKeys: yKeys.length ? yKeys : cols.slice(0, 1),
      title: spec.title,
      showLegend: true,
      showGrid: true
    }
  }
  if (spec.kind === 'kpi' && cols[0]) {
    return {
      widgetType: 'kpi',
      format: spec.format ?? 'number',
      label: spec.title,
      valueKey: cols[0]
    }
  }
  return { widgetType: 'table', maxRows: 50 }
}
