import { useEffect, useRef, useState } from 'react'
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
} from '@data-peek/ui'

export function McpApprovalDialog(): React.JSX.Element | null {
  const [request, setRequest] = useState<McpApprovalRequest | null>(null)
  const respondedRef = useRef(false)

  useEffect(() => {
    return window.api.mcp.onApprovalRequest((next) => {
      respondedRef.current = false
      setRequest(next)
    })
  }, [])

  if (!request) return null

  const respond = (approved: boolean): void => {
    if (respondedRef.current) return
    respondedRef.current = true
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
          <AlertDialogCancel>Reject</AlertDialogCancel>
          <AlertDialogAction onClick={() => respond(true)}>Approve & run</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
