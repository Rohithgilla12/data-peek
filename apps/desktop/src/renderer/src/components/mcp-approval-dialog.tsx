import { useEffect, useState } from 'react'
import type { McpApprovalRequest } from '@shared/index'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

export function McpApprovalDialog(): React.JSX.Element | null {
  const [request, setRequest] = useState<McpApprovalRequest | null>(null)

  useEffect(() => window.api.mcp.onApprovalRequest(setRequest), [])

  if (!request) return null

  const respond = (approved: boolean): void => {
    void window.api.mcp.respondToApproval(request.id, approved)
    setRequest(null)
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && respond(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Agent wants to run a write statement</AlertDialogTitle>
          <AlertDialogDescription>
            An MCP client is asking to execute this on <strong>{request.connectionName}</strong>. It
            auto-rejects in 60 seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <pre className="max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">
          {request.sql}
        </pre>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>Reject</AlertDialogCancel>
          <AlertDialogAction onClick={() => respond(true)}>Approve & run</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
