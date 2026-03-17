import { useState, useEffect, useMemo } from 'react'
import { Clock, Calendar, Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useDashboardStore } from '@/stores'
import type { Dashboard, SchedulePreset } from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'

interface RefreshScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: Dashboard
}

const presetOptions: { value: SchedulePreset; label: string }[] = [
  { value: 'every_minute', label: 'Every minute' },
  { value: 'every_5_minutes', label: 'Every 5 minutes' },
  { value: 'every_15_minutes', label: 'Every 15 minutes' },
  { value: 'every_30_minutes', label: 'Every 30 minutes' },
  { value: 'every_hour', label: 'Every hour' },
  { value: 'every_6_hours', label: 'Every 6 hours' },
  { value: 'every_12_hours', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily at midnight' },
  { value: 'weekly', label: 'Weekly on Sunday' },
  { value: 'monthly', label: 'Monthly on 1st' },
  { value: 'custom', label: 'Custom cron expression' }
]

/**
 * Render a modal dialog that configures an automatic refresh schedule for a dashboard.
 *
 * The dialog lets the user enable/disable auto-refresh, choose a preset frequency or enter a custom cron expression,
 * previews upcoming run times when available, validates custom cron input, and saves changes back to the dashboard.
 *
 * @param props.open - Controls whether the dialog is visible
 * @param props.onOpenChange - Callback invoked with the new open state
 * @param props.dashboard - Dashboard data used to initialize and persist refresh settings
 * @returns A JSX element that renders the auto-refresh schedule dialog
 */
export function RefreshScheduleDialog({
  open,
  onOpenChange,
  dashboard
}: RefreshScheduleDialogProps) {
  const updateRefreshSchedule = useDashboardStore((s) => s.updateRefreshSchedule)

  const [enabled, setEnabled] = useState(dashboard.refreshSchedule?.enabled ?? false)
  const [preset, setPreset] = useState<SchedulePreset>(
    dashboard.refreshSchedule?.preset ?? 'every_hour'
  )
  const [cronExpression, setCronExpression] = useState(
    dashboard.refreshSchedule?.cronExpression ?? ''
  )
  const [cronError, setCronError] = useState<string | null>(null)
  const [nextRuns, setNextRuns] = useState<number[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setEnabled(dashboard.refreshSchedule?.enabled ?? false)
      setPreset(dashboard.refreshSchedule?.preset ?? 'every_hour')
      setCronExpression(dashboard.refreshSchedule?.cronExpression ?? '')
      setCronError(null)
    }
  }, [open, dashboard.refreshSchedule])

  const currentCronExpression = useMemo(() => {
    if (preset === 'custom') {
      return cronExpression
    }
    return SCHEDULE_PRESETS[preset as Exclude<SchedulePreset, 'custom'>]?.cron ?? ''
  }, [preset, cronExpression])

  useEffect(() => {
    if (!enabled || !currentCronExpression) {
      setNextRuns([])
      return
    }

    const fetchNextRuns = async () => {
      try {
        const result = await window.api.dashboards.getNextRefreshTimes(currentCronExpression, 5)
        if (result.success && result.data) {
          setNextRuns(result.data)
          setCronError(null)
        } else {
          setNextRuns([])
          if (preset === 'custom') {
            setCronError(result.error || 'Invalid cron expression')
          }
        }
      } catch {
        setNextRuns([])
      }
    }

    fetchNextRuns()
  }, [enabled, currentCronExpression, preset])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateRefreshSchedule(dashboard.id, {
        enabled,
        preset,
        cronExpression: preset === 'custom' ? cronExpression : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const formatNextRunTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = Date.now()
    const diff = timestamp - now

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    let relative = ''
    if (minutes < 60) {
      relative = `in ${minutes} min`
    } else if (hours < 24) {
      relative = `in ${hours} hr`
    } else {
      relative = `in ${days} day${days > 1 ? 's' : ''}`
    }

    return `${date.toLocaleString()} (${relative})`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5" />
            Auto-Refresh Schedule
          </DialogTitle>
          <DialogDescription>
            Configure automatic data refresh for this dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enable auto-refresh</Label>
              <p className="text-xs text-muted-foreground">
                Automatically refresh all widgets on a schedule
              </p>
            </div>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="preset">Refresh frequency</Label>
                <Select value={preset} onValueChange={(v) => setPreset(v as SchedulePreset)}>
                  <SelectTrigger id="preset">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {presetOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {preset === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="cron">Cron expression</Label>
                  <Input
                    id="cron"
                    placeholder="*/15 * * * *"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className={cronError ? 'border-red-500' : ''}
                  />
                  {cronError ? (
                    <p className="text-xs text-red-500">{cronError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Standard cron format: minute hour day month weekday
                    </p>
                  )}
                </div>
              )}

              {nextRuns.length > 0 && (
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="size-4" />
                    Next scheduled refreshes
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {nextRuns.slice(0, 3).map((time, i) => (
                      <li key={i}>{formatNextRunTime(time)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
                <Info className="size-4 mt-0.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Auto-refresh runs in the background when the app is open. Widget data will update
                  automatically without manual refresh.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || (preset === 'custom' && !!cronError)}>
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
