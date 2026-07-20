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
import type { CreateWidgetInput, WidgetConfig, SchemaInfo } from '@data-peek/shared'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useConnectionStore } from '@/stores/connection-store'

interface AIWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
}

/**
 * "Ask AI to add a widget" — a natural-language prompt is answered by the AI
 * assistant (grounded via the harness/MCP when the local-CLI provider is active),
 * and its structured response (chart / metric / query) is mapped straight into a
 * dashboard widget and pinned.
 */
export function AIWidgetDialog({ open, onOpenChange, dashboardId }: AIWidgetDialogProps) {
  const [prompt, setPrompt] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const addWidget = useDashboardStore((s) => s.addWidget)
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const schemas = useConnectionStore((s) => s.schemas)
  const connection = connections.find((c) => c.id === activeConnectionId) ?? null

  const reset = () => {
    setPrompt('')
    setError(null)
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    if (!connection) {
      setError('Select a connection first — the widget needs a database to query.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dbType = connection.dbType || 'postgresql'
      const res = await window.api.ai.chat(
        [{ role: 'user', content: prompt.trim() }],
        schemas as unknown as SchemaInfo[],
        dbType,
        connection.id
      )
      if (!res.success || !res.data) {
        setError(res.error || 'The assistant could not answer that.')
        return
      }
      const data = res.data
      if (!data.sql) {
        setError("That didn't produce a query to chart. Try naming a table or metric.")
        return
      }

      // Resolve real column names by running the (read-only) query once so the
      // widget config points at columns that actually exist.
      const run = await window.api.db.query(connection, data.sql)
      const rows = (run.success && (run.data as { rows?: Record<string, unknown>[] })?.rows) || []
      const cols = rows[0] ? Object.keys(rows[0]) : []

      const { config, w, h } = buildConfig(data, cols)
      const name =
        (data.type === 'chart' && data.title) ||
        (data.type === 'metric' && data.label) ||
        data.message?.slice(0, 60) ||
        'AI widget'

      const input: CreateWidgetInput = {
        name,
        dataSource: { type: 'inline', sql: data.sql, connectionId: connection.id },
        config,
        layout: { x: 0, y: 0, w, h, minW: 2, minH: 2 },
        aiGenerated: true
      }
      await addWidget(dashboardId, input)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the widget.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-400" />
            Ask AI to add a widget
          </DialogTitle>
          <DialogDescription>
            Describe what you want to see. The assistant writes the query against your
            {connection ? ` ${connection.name}` : ''} schema and pins it as a widget.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
          }}
          rows={3}
          autoFocus
          placeholder="e.g. revenue by plan as a bar chart"
          className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm outline-none focus:border-blue-500/50"
        />

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
          <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate widget
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ChatData = NonNullable<Awaited<ReturnType<typeof window.api.ai.chat>>['data']>

/** Map an AI structured response + real columns → a widget config + grid size. */
function buildConfig(
  data: ChatData,
  cols: string[]
): { config: WidgetConfig; w: number; h: number } {
  // Chart when the model returned a usable chart spec.
  if (data.type === 'chart' && data.chartType && (data.xKey || cols[0])) {
    const xKey = data.xKey && cols.includes(data.xKey) ? data.xKey : cols[0]
    const yKeys =
      (data.yKeys ?? []).filter((k) => cols.includes(k)).length > 0
        ? (data.yKeys ?? []).filter((k) => cols.includes(k))
        : cols.filter((c) => c !== xKey).slice(0, 1)
    return {
      config: {
        widgetType: 'chart',
        chartType: data.chartType,
        xKey,
        yKeys: yKeys.length ? yKeys : cols.slice(0, 1),
        title: data.title ?? undefined,
        showLegend: true,
        showGrid: true
      },
      w: 6,
      h: 4
    }
  }

  // KPI for a single-value metric.
  if (data.type === 'metric' && cols[0]) {
    return {
      config: {
        widgetType: 'kpi',
        format: data.format ?? 'number',
        label: data.label ?? data.message?.slice(0, 40) ?? 'Metric',
        valueKey: cols[0]
      },
      w: 3,
      h: 2
    }
  }

  // Otherwise show the rows as a table.
  return { config: { widgetType: 'table', maxRows: 50 }, w: 6, h: 4 }
}
