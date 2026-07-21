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
import type { CreateWidgetInput, SchemaInfo } from '@data-peek/shared'
import { isReadOnlySql } from '@data-peek/shared'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useConnectionStore } from '@/stores/connection-store'
import { buildWidgetConfig, widgetNameFor } from '@/lib/ai-widget'

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
  const refreshWidget = useDashboardStore((s) => s.refreshWidget)
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
      // Never run/pin generated SQL that isn't a single read-only statement.
      if (!isReadOnlySql(data.sql)) {
        setError('The generated query is not read-only, so it was not run. Try rephrasing.')
        return
      }

      // Resolve real column names by running the (read-only) query once so the
      // widget config points at columns that actually exist.
      const run = await window.api.db.query(connection, data.sql)
      const rows = (run.success && (run.data as { rows?: Record<string, unknown>[] })?.rows) || []
      const cols = rows[0] ? Object.keys(rows[0]) : []

      const { config, w, h } = buildWidgetConfig(data, cols)
      const name = widgetNameFor(data)

      const input: CreateWidgetInput = {
        name,
        dataSource: { type: 'inline', sql: data.sql, connectionId: connection.id },
        config,
        layout: { x: 0, y: 0, w, h, minW: 2, minH: 2 },
        aiGenerated: true
      }
      const created = await addWidget(dashboardId, input)
      // Run it immediately so data shows without a manual Refresh.
      if (created) await refreshWidget(created)
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
