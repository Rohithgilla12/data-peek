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
import type { SchemaInfo } from '@data-peek/shared'
import { useNotebookStore } from '@/stores/notebook-store'
import { useConnectionStore } from '@/stores/connection-store'

interface NotebookAICellDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  connectionId?: string
  /** Order to insert the new cell(s) at (defaults to end). */
  order: number
}

/**
 * "AI cell" — a natural-language prompt is answered by the AI assistant
 * (grounded via the harness/MCP when the local-CLI provider is active) and the
 * verified SQL is dropped into the notebook as a ready-to-run cell, with a short
 * markdown note above it.
 */
export function NotebookAICellDialog({
  open,
  onOpenChange,
  notebookId,
  connectionId,
  order
}: NotebookAICellDialogProps) {
  const [prompt, setPrompt] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const addCell = useNotebookStore((s) => s.addCell)
  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const connection = connections.find((c) => c.id === connectionId) ?? null

  const reset = () => {
    setPrompt('')
    setError(null)
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    if (!connection) {
      setError('This notebook has no connection — open it on a database first.')
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
        setError('That did not produce a query. Try naming a table or a metric.')
        return
      }
      // A short markdown note (the ask + explanation) followed by the runnable SQL.
      const note = [`**${prompt.trim()}**`, data.explanation || data.message]
        .filter(Boolean)
        .join('\n\n')
      await addCell(notebookId, { type: 'markdown', content: note, order })
      await addCell(notebookId, { type: 'sql', content: data.sql, order: order + 0.5 })
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the cell.')
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
            AI cell
          </DialogTitle>
          <DialogDescription>
            Describe what you want. The assistant writes the query against your
            {connection ? ` ${connection.name}` : ''} schema and adds a ready-to-run cell.
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
          placeholder="e.g. monthly signups for the last 6 months"
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
                Add AI cell
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
