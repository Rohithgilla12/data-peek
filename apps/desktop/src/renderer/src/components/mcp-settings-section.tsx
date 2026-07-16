import { useEffect, useState } from 'react'
import { Button, Input, Label, Switch } from '@data-peek/ui'
import type { IpcResponse, McpServerStatus } from '@shared/index'

export function McpSettingsSection() {
  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [portDraft, setPortDraft] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.mcp
      .status()
      .then((response) => {
        if (cancelled) return
        if (response.success && response.data) {
          setStatus(response.data)
          setPortDraft(String(response.data.port))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const applyResult = (response: IpcResponse<McpServerStatus>) => {
    if (response.success && response.data) {
      setStatus(response.data)
      setPortDraft(String(response.data.port))
      setError(null)
    } else {
      setError(response.error ?? 'Unknown error')
    }
  }

  if (!status) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          MCP Server
        </h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const snippet = `claude mcp add --transport http data-peek ${status.url} --header "Authorization: Bearer ${status.token}"`

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        MCP Server
      </h3>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="mcp-enabled">Enable MCP server</Label>
          <p className="text-xs text-muted-foreground">
            Let local AI agents query your connections. Writes always require approval here.
          </p>
        </div>
        <Switch
          id="mcp-enabled"
          checked={status.enabled}
          onCheckedChange={(enabled) => window.api.mcp.setEnabled(enabled).then(applyResult)}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="mcp-port">Port</Label>
          <p className="text-xs text-muted-foreground">Local port the MCP server listens on</p>
        </div>
        <Input
          id="mcp-port"
          type="number"
          className="w-24 font-mono"
          value={portDraft}
          onChange={(e) => setPortDraft(e.target.value)}
          onBlur={() => {
            const port = Number.parseInt(portDraft, 10)
            if (Number.isInteger(port) && port !== status.port) {
              window.api.mcp.setPort(port).then(applyResult)
            } else {
              setPortDraft(String(status.port))
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="mcp-token">Access token</Label>
          <p className="text-xs text-muted-foreground">Bearer token for MCP client setup</p>
        </div>
        <div className="flex items-center gap-2">
          <Input id="mcp-token" readOnly className="w-40 font-mono text-xs" value={status.token} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => window.api.mcp.regenerateToken().then(applyResult)}
          >
            Regenerate
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Setup command</Label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{snippet}</code>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(snippet)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </div>
  )
}
