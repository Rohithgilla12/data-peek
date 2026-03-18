import { useState, useEffect, useCallback } from 'react'
import { Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useScheduledQueryStore, useConnectionStore } from '@/stores'
import type { ScheduledQuery, SchedulePreset, CreateScheduledQueryInput } from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'

interface ScheduledQueryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingQuery: ScheduledQuery | null
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
 * Render a modal dialog for creating or editing a scheduled query.
 *
 * The form supports preset and custom cron schedules (with validation and next-run preview),
 * selects a connection, configures notifications and history limits, and creates or updates
 * the scheduled query on submit.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback invoked with the new open state to close or open the dialog
 * @param editingQuery - When provided, populates the form to edit an existing scheduled query; when `null`, the form is initialized for creation
 * @returns The dialog element for creating or editing a scheduled query
 */
export function ScheduledQueryFormDialog({
  open,
  onOpenChange,
  editingQuery
}: ScheduledQueryFormDialogProps) {
  const connections = useConnectionStore((s) => s.connections)
  const createScheduledQuery = useScheduledQueryStore((s) => s.createScheduledQuery)
  const updateScheduledQuery = useScheduledQueryStore((s) => s.updateScheduledQuery)
  const validateCron = useScheduledQueryStore((s) => s.validateCron)
  const getNextRunTimes = useScheduledQueryStore((s) => s.getNextRunTimes)

  // Form state
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [description, setDescription] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('every_hour')
  const [cronExpression, setCronExpression] = useState('')
  const [notifyOnComplete, setNotifyOnComplete] = useState(false)
  const [notifyOnError, setNotifyOnError] = useState(true)
  const [maxHistoryRuns, setMaxHistoryRuns] = useState(100)

  // Validation state
  const [cronError, setCronError] = useState<string | null>(null)
  const [nextRuns, setNextRuns] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens/closes or editing query changes
  useEffect(() => {
    if (open) {
      if (editingQuery) {
        setName(editingQuery.name)
        setQuery(editingQuery.query)
        setDescription(editingQuery.description || '')
        setConnectionId(editingQuery.connectionId)
        setSchedulePreset(editingQuery.schedule.preset)
        setCronExpression(editingQuery.schedule.cronExpression || '')
        setNotifyOnComplete(editingQuery.notifyOnComplete)
        setNotifyOnError(editingQuery.notifyOnError)
        setMaxHistoryRuns(editingQuery.maxHistoryRuns)
      } else {
        setName('')
        setQuery('')
        setDescription('')
        setConnectionId(connections[0]?.id || '')
        setSchedulePreset('every_hour')
        setCronExpression('')
        setNotifyOnComplete(false)
        setNotifyOnError(true)
        setMaxHistoryRuns(100)
      }
      setCronError(null)
      setNextRuns([])
    }
  }, [open, editingQuery, connections])

  // Validate cron expression when it changes
  useEffect(() => {
    if (schedulePreset === 'custom' && cronExpression) {
      const timer = setTimeout(async () => {
        const result = await validateCron(cronExpression)
        if (result.valid) {
          setCronError(null)
          const times = await getNextRunTimes(cronExpression, 3)
          setNextRuns(times)
        } else {
          setCronError(result.error || 'Invalid cron expression')
          setNextRuns([])
        }
      }, 300)
      return () => clearTimeout(timer)
    } else if (schedulePreset !== 'custom') {
      setCronError(null)
      // Show next runs for preset
      const cron = SCHEDULE_PRESETS[schedulePreset as keyof typeof SCHEDULE_PRESETS]?.cron
      if (cron) {
        getNextRunTimes(cron, 3).then(setNextRuns)
      }
    }
    return undefined
  }, [schedulePreset, cronExpression, validateCron, getNextRunTimes])

  const handleSubmit = useCallback(async () => {
    if (!name || !query || !connectionId) return
    if (schedulePreset === 'custom' && cronError) return

    setIsSubmitting(true)
    try {
      const input: CreateScheduledQueryInput = {
        name,
        query,
        description: description || undefined,
        connectionId,
        schedule: {
          preset: schedulePreset,
          cronExpression: schedulePreset === 'custom' ? cronExpression : undefined
        },
        notifyOnComplete,
        notifyOnError,
        maxHistoryRuns
      }

      if (editingQuery) {
        await updateScheduledQuery(editingQuery.id, input)
      } else {
        await createScheduledQuery(input)
      }

      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }, [
    name,
    query,
    connectionId,
    schedulePreset,
    cronExpression,
    cronError,
    description,
    notifyOnComplete,
    notifyOnError,
    maxHistoryRuns,
    editingQuery,
    createScheduledQuery,
    updateScheduledQuery,
    onOpenChange
  ])

  const isValid =
    name.trim() &&
    query.trim() &&
    connectionId &&
    (schedulePreset !== 'custom' || (!cronError && cronExpression.trim()))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            {editingQuery ? 'Edit Scheduled Query' : 'Create Scheduled Query'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily sales report"
            />
          </div>

          {/* Connection */}
          <div className="space-y-2">
            <Label htmlFor="connection">Connection *</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="connection">
                <SelectValue placeholder="Select a connection" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id}>
                    {conn.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Query */}
          <div className="space-y-2">
            <Label htmlFor="query">SQL Query *</Label>
            <Textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '1 day'"
              className="font-mono text-sm min-h-[100px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label htmlFor="schedule">Schedule *</Label>
            <Select
              value={schedulePreset}
              onValueChange={(v) => setSchedulePreset(v as SchedulePreset)}
            >
              <SelectTrigger id="schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom cron expression */}
          {schedulePreset === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="cron">Cron Expression *</Label>
              <Input
                id="cron"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="font-mono"
              />
              {cronError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {cronError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          )}

          {/* Next runs preview */}
          {nextRuns.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Next runs:</Label>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {nextRuns.map((time, i) => (
                  <div key={i}>
                    {new Date(time).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs text-muted-foreground">Notifications</Label>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyComplete" className="text-sm font-normal">
                Notify on completion
              </Label>
              <Switch
                id="notifyComplete"
                checked={notifyOnComplete}
                onCheckedChange={setNotifyOnComplete}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyError" className="text-sm font-normal">
                Notify on error
              </Label>
              <Switch id="notifyError" checked={notifyOnError} onCheckedChange={setNotifyOnError} />
            </div>
          </div>

          {/* History limit */}
          <div className="space-y-2">
            <Label htmlFor="maxHistory">Max history runs</Label>
            <Input
              id="maxHistory"
              type="number"
              min={1}
              max={1000}
              value={maxHistoryRuns}
              onChange={(e) => setMaxHistoryRuns(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving...' : editingQuery ? 'Save Changes' : 'Create Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
