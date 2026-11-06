import { useEffect, useState } from 'react'
import { Button, Label, Switch } from '@data-peek/ui'
import type { TimeMachineStats } from '@data-peek/shared'

import { useSettingsStore } from '@/stores/settings-store'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function TimeMachineSettingsSection() {
  const timeMachineEnabled = useSettingsStore((s) => s.timeMachineEnabled)
  const setTimeMachineEnabled = useSettingsStore((s) => s.setTimeMachineEnabled)

  const [stats, setStats] = useState<TimeMachineStats | null>(null)
  const [wipeArmed, setWipeArmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.timeMachine
      .stats()
      .then((response) => {
        if (!cancelled && response.success && response.data) setStats(response.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleWipe = async () => {
    if (!wipeArmed) {
      setWipeArmed(true)
      return
    }
    setWipeArmed(false)
    try {
      await window.api.timeMachine.clearAll()
      const response = await window.api.timeMachine.stats()
      if (response.success && response.data) setStats(response.data)
    } catch {
      // Storage unavailable — nothing to wipe.
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Time Machine
      </h3>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="time-machine">Snapshot query results</Label>
          <p className="font-sans text-xs text-muted-foreground">
            Keep a local history of SELECT results to scrub and diff. Masked columns are stored
            redacted.
          </p>
        </div>
        <Switch
          id="time-machine"
          checked={timeMachineEnabled}
          onCheckedChange={setTimeMachineEnabled}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="font-sans text-xs text-muted-foreground">
          {stats
            ? `${stats.runCount} runs across ${stats.queryCount} queries · ${formatBytes(stats.totalBytes)} on disk`
            : 'No snapshot storage in use'}
        </p>
        <Button
          variant={wipeArmed ? 'destructive' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          disabled={!stats || stats.runCount === 0}
          onClick={handleWipe}
        >
          {wipeArmed ? 'Click again to confirm' : 'Delete all snapshots'}
        </Button>
      </div>
    </div>
  )
}
