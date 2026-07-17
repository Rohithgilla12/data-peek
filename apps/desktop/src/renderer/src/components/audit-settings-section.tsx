import { useEffect, useState } from 'react'
import { Button, Input, Label, Switch } from '@data-peek/ui'
import type { AuditStatus, IpcResponse } from '@shared/index'

export function AuditSettingsSection() {
  const [status, setStatus] = useState<AuditStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<string | null>(null)
  const [retentionDraft, setRetentionDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api.audit
      .status()
      .then((response) => {
        if (cancelled) return
        if (response.success && response.data) {
          setStatus(response.data)
          setRetentionDraft(String(response.data.retentionDays))
        } else {
          setError(response.error ?? 'Unknown error')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load audit status')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyResult = (response: IpcResponse<AuditStatus>) => {
    setVerifyResult(null)
    setExportResult(null)
    if (response.success && response.data) {
      setStatus(response.data)
      setRetentionDraft(String(response.data.retentionDays))
      setError(null)
    } else {
      setError(response.error ?? 'Unknown error')
    }
  }

  if (!status && !error) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Audit Log
        </h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Audit Log
        </h3>
        <p className="text-xs text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Audit Log
      </h3>
      <p className="text-xs text-muted-foreground">
        Records SQL statements data-peek executes — editor, edits, DDL, scheduled, and agent (MCP) —
        in a local file on this machine. Not recorded: the explain panel, schema reads, and agent
        writes you reject. SQL text can contain data values. Off by default; prunable and deletable.
      </p>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="audit-enabled">Enable audit log</Label>
          {!status.available && (
            <p className="text-xs text-muted-foreground">
              Audit storage unavailable on this system
            </p>
          )}
        </div>
        <Switch
          id="audit-enabled"
          checked={status.enabled}
          disabled={!status.available}
          onCheckedChange={(enabled) => window.api.audit.setEnabled(enabled).then(applyResult)}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="audit-retention">Retention (days)</Label>
          <p className="text-xs text-muted-foreground">Entries older than this are pruned</p>
        </div>
        <Input
          id="audit-retention"
          type="number"
          min={7}
          max={3650}
          className="w-24 font-mono"
          value={retentionDraft}
          onChange={(e) => setRetentionDraft(e.target.value)}
          onBlur={() => {
            const days = Number.parseInt(retentionDraft, 10)
            if (
              Number.isInteger(days) &&
              days >= 7 &&
              days <= 3650 &&
              days !== status.retentionDays
            ) {
              window.api.audit.setRetention(days).then(applyResult)
            } else {
              setRetentionDraft(String(status.retentionDays))
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Integrity</Label>
          <p className="text-xs text-muted-foreground">
            {status.entryCount} entries recorded
            {verifyResult ? ` — ${verifyResult}` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setExportResult(null)
            setError(null)
            window.api.audit.verify().then((response) => {
              if (response.success && response.data) {
                setVerifyResult(
                  response.data.valid
                    ? `Chain intact — ${response.data.entries} entries`
                    : `Chain broken at entry #${response.data.firstBrokenId}`
                )
              } else {
                setError(response.error ?? 'Unknown error')
              }
            })
          }}
        >
          Verify integrity
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Export</Label>
          <p className="text-xs text-muted-foreground">
            {exportResult ?? 'Export the audit log to a local file'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setVerifyResult(null)
              setError(null)
              window.api.audit.export('csv').then((response) => {
                if (response.success) {
                  if (response.data) {
                    setExportResult(`Exported ${response.data.entries} entries`)
                  }
                } else {
                  setError(response.error ?? 'Unknown error')
                }
              })
            }}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setVerifyResult(null)
              setError(null)
              window.api.audit.export('json').then((response) => {
                if (response.success) {
                  if (response.data) {
                    setExportResult(`Exported ${response.data.entries} entries`)
                  }
                } else {
                  setError(response.error ?? 'Unknown error')
                }
              })
            }}
          >
            Export JSON
          </Button>
        </div>
      </div>
    </div>
  )
}
