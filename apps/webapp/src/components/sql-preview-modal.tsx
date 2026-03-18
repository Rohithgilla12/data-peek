import { Copy, Check, FileCode, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

interface SqlPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sqlStatements: Array<{ operationId: string; sql: string; type: 'insert' | 'update' | 'delete' }>
  onConfirm: () => void
  isLoading?: boolean
}

function getOperationColor(type: string): string {
  switch (type) {
    case 'insert':
      return 'text-green-500 border-green-500/30'
    case 'update':
      return 'text-amber-500 border-amber-500/30'
    case 'delete':
      return 'text-red-500 border-red-500/30'
    default:
      return 'text-muted-foreground'
  }
}

function getOperationLabel(type: string): string {
  switch (type) {
    case 'insert':
      return 'INSERT'
    case 'update':
      return 'UPDATE'
    case 'delete':
      return 'DELETE'
    default:
      return type.toUpperCase()
  }
}

export function SqlPreviewModal({
  open,
  onOpenChange,
  sqlStatements,
  onConfirm,
  isLoading = false
}: SqlPreviewModalProps) {
  const { copied, copy } = useCopyToClipboard()

  const handleCopyAll = () => {
    const allSql = sqlStatements.map((s) => s.sql).join(';\n\n')
    copy(allSql)
  }

  const insertCount = sqlStatements.filter((s) => s.type === 'insert').length
  const updateCount = sqlStatements.filter((s) => s.type === 'update').length
  const deleteCount = sqlStatements.filter((s) => s.type === 'delete').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="size-5 text-primary" />
            SQL Preview
          </DialogTitle>
          <DialogDescription>
            Review the SQL statements that will be executed. Changes are wrapped in a transaction.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex items-center gap-2 py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Summary:</span>
          {insertCount > 0 && (
            <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
              {insertCount} INSERT
            </Badge>
          )}
          {updateCount > 0 && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">
              {updateCount} UPDATE
            </Badge>
          )}
          {deleteCount > 0 && (
            <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
              {deleteCount} DELETE
            </Badge>
          )}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleCopyAll}
          >
            {copied ? (
              <>
                <Check className="size-3 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-3" />
                Copy All
              </>
            )}
          </Button>
        </div>

        {/* SQL Statements */}
        <div className="flex-1 min-h-0 overflow-auto space-y-3 py-2">
          {sqlStatements.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <AlertCircle className="size-4 mr-2" />
              No SQL statements to preview
            </div>
          ) : (
            sqlStatements.map((statement, index) => (
              <div
                key={statement.operationId}
                className="group border border-border/50 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5', getOperationColor(statement.type))}
                    >
                      {getOperationLabel(statement.type)}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copy(statement.sql)}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words bg-muted/10">
                  <code className="text-foreground/90">{statement.sql}</code>
                </pre>
              </div>
            ))
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
          <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-600">Review Carefully</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              These changes will be executed within a single transaction. If any statement fails,
              all changes will be rolled back.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || sqlStatements.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Executing...
              </>
            ) : (
              <>
                Execute {sqlStatements.length} Statement{sqlStatements.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
