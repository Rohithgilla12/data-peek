import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@data-peek/ui'
import { Layers } from 'lucide-react'
import type { ResolveForRunSummary } from '@/lib/cross-tab-integration'

interface CrossTabSubmitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ResolveForRunSummary | null
  onConfirm: () => void
}

export function CrossTabSubmitDialog({
  open,
  onOpenChange,
  summary,
  onConfirm
}: CrossTabSubmitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            Running with {summary?.refCount ?? 0} tab{' '}
            {summary?.refCount === 1 ? 'reference' : 'references'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {summary?.references.map((r) => (
            <div key={r.name} className="flex items-center justify-between font-mono text-xs">
              <span className="text-muted-foreground">@{r.name}</span>
              <span>
                {r.rows.toLocaleString()} rows · {(r.bytes / 1024).toFixed(1)}KB
              </span>
            </div>
          ))}
          <div className="border-t border-border/50 pt-2 font-mono text-xs">
            Inlined: {summary?.rowsInlined.toLocaleString()} rows ·{' '}
            {((summary?.bytesAdded ?? 0) / 1024).toFixed(1)}KB
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Run query
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
