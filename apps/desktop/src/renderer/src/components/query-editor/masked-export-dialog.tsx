import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@data-peek/ui'
import type { ExportData, ExportDestination, ExportFormat } from '@/lib/export'

export interface PendingExport {
  format: ExportFormat
  destination: ExportDestination
  data: ExportData
  filename: string
}

interface MaskedExportDialogProps {
  pendingExport: PendingExport | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Confirmation dialog shown before exporting/copying data that contains masked
 * columns, warning that masked values are replaced with [MASKED] in the output.
 */
export function MaskedExportDialog({
  pendingExport,
  onOpenChange,
  onConfirm
}: MaskedExportDialogProps) {
  const isClipboard = pendingExport?.destination === 'clipboard'

  return (
    <AlertDialog open={!!pendingExport} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isClipboard ? 'Copy with masked columns?' : 'Export with masked columns?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Some columns are currently masked. The exported data will contain{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">[MASKED]</code> in
            place of sensitive values. Do you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isClipboard ? 'Copy with [MASKED] values' : 'Export with [MASKED] values'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
