import { AlertTriangle, CheckCircle2, XCircle, Code } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PendingApproval } from '@/stores/agent-store'

interface AgentApprovalDialogProps {
  approval: PendingApproval | null
  onApprove: () => void
  onDecline: () => void
  isLoading?: boolean
}

export function AgentApprovalDialog({
  approval,
  onApprove,
  onDecline,
  isLoading
}: AgentApprovalDialogProps) {
  if (!approval) return null

  return (
    <Dialog open={!!approval} onOpenChange={() => onDecline()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-full bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="size-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle>Approval Required</DialogTitle>
              <DialogDescription className="mt-1">
                The AI agent wants to execute a query that modifies data.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
            <Code className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Reason</p>
              <p className="text-sm text-muted-foreground">{approval.reason}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">SQL Query</p>
            <ScrollArea className="h-[150px] rounded-lg border border-border/50 bg-background">
              <pre className="p-3 text-sm font-mono whitespace-pre-wrap break-all">
                {approval.sql}
              </pre>
            </ScrollArea>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This query will modify your database. Please review carefully before approving.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onDecline} disabled={isLoading} className="gap-2">
            <XCircle className="size-4" />
            Decline
          </Button>
          <Button
            onClick={onApprove}
            disabled={isLoading}
            className="gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
          >
            <CheckCircle2 className="size-4" />
            Approve & Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
