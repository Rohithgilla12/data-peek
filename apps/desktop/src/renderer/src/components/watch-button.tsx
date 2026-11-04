import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIcon,
  BellRingingIcon,
  EyeIcon,
  EyeSlashIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
  WarningIcon
} from '@/components/icons'
import {
  cn,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  keys
} from '@data-peek/ui'
import { useWatchStore } from '@/stores/watch-store'
import { gridHoldReason, useEditStore } from '@/stores/edit-store'
import { gateForWatch } from '@/lib/watch-sql-gate'
import {
  CADENCE_PRESETS_MS,
  DEFAULT_WATCH_CONFIG,
  type WatchAlertCondition
} from '@/lib/watch-types'
import { watchScheduler, type WatchRunner } from '@/lib/watch-scheduler'
import { describeAlertCondition } from '@/lib/watch-alerts'
import { WatchSparkline } from './watch-sparkline'

/** How long the toolbar pill stays rose-tinted after an alert fires. */
const ALERT_FLASH_MS = 4000

type AlertDraftKind = 'rows_gt' | 'rows_lt' | 'rows_change' | 'any_change' | 'query_errors'

const ALERT_DRAFT_OPTIONS: Array<{ value: AlertDraftKind; label: string; needsValue: boolean }> = [
  { value: 'rows_gt', label: 'rows >', needsValue: true },
  { value: 'rows_lt', label: 'rows <', needsValue: true },
  { value: 'rows_change', label: 'row count changes', needsValue: false },
  { value: 'any_change', label: 'anything changes', needsValue: false },
  { value: 'query_errors', label: 'query errors', needsValue: false }
]

function draftToCondition(kind: AlertDraftKind, value: number): WatchAlertCondition {
  switch (kind) {
    case 'rows_gt':
      return { kind: 'row_count', op: 'gt', value }
    case 'rows_lt':
      return { kind: 'row_count', op: 'lt', value }
    case 'rows_change':
      return { kind: 'row_count_changes' }
    case 'any_change':
      return { kind: 'any_change' }
    case 'query_errors':
      return { kind: 'query_errors' }
  }
}

interface WatchButtonProps {
  tabId: string
  query: string
  disabled?: boolean
  runner: WatchRunner
  /** Called when watch is invalidated because the SQL was edited. */
  onSqlInvalidated?: () => void
}

function formatCadence(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0).replace(/\.0$/, '')}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3_600_000)}h`
}

function useCountdown(nextTickAt: number | null, paused: boolean): number | null {
  const [, force] = useState(0)
  useEffect(() => {
    if (paused || !nextTickAt) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [paused, nextTickAt])
  if (!nextTickAt || paused) return null
  return Math.max(0, nextTickAt - Date.now())
}

export function WatchButton({
  tabId,
  query,
  disabled,
  runner,
  onSqlInvalidated
}: WatchButtonProps) {
  const watchState = useWatchStore((s) => s.states[tabId])
  const start = useWatchStore((s) => s.start)
  const stop = useWatchStore((s) => s.stop)
  const pause = useWatchStore((s) => s.pause)
  const resume = useWatchStore((s) => s.resume)
  const updateConfig = useWatchStore((s) => s.updateConfig)
  const invalidate = useWatchStore((s) => s.invalidate)
  const addAlert = useWatchStore((s) => s.addAlert)
  const removeAlert = useWatchStore((s) => s.removeAlert)

  const [open, setOpen] = useState(false)
  const [draftKind, setDraftKind] = useState<AlertDraftKind>('rows_gt')
  const [draftValue, setDraftValue] = useState('')
  const enabled = !!watchState && watchState.enabled
  const paused = !!watchState?.paused
  const config = watchState?.config ?? DEFAULT_WATCH_CONFIG

  // The query keeps polling while the user has an inline edit in flight, but the
  // tab store declines to move the rows under it (see applyWatchResult). Without
  // saying so, the pill would count down to ticks that visibly do nothing.
  const holdReason = useEditStore((s) => gridHoldReason(s.tabEdits, tabId))
  const held = enabled && !paused && holdReason !== null

  const gate = useMemo(() => gateForWatch(query), [query])

  // Hold latest runner in a ref so the scheduler doesn't tear/re-register
  // every render. The scheduler only reads runner.runQuery + getKeyColumns,
  // so a stable wrapper is enough.
  const runnerRef = useRef(runner)
  useEffect(() => {
    runnerRef.current = runner
  }, [runner])

  const handleToggle = useCallback(() => {
    if (enabled) {
      stop(tabId)
      watchScheduler.unregister(tabId)
      return
    }
    if (!gate.ok) return
    start(tabId)
    watchScheduler.register(tabId, {
      runQuery: () => runnerRef.current.runQuery(),
      getKeyColumns: () => runnerRef.current.getKeyColumns?.()
    })
  }, [enabled, gate, start, stop, tabId])

  // If the underlying SQL stops being watchable while we're watching, tear down.
  const lastSql = useRef(query)
  useEffect(() => {
    if (!enabled) {
      lastSql.current = query
      return
    }
    if (lastSql.current === query) return
    lastSql.current = query
    if (!gate.ok) {
      invalidate(tabId, 'destructive_sql')
      watchScheduler.unregister(tabId)
      onSqlInvalidated?.()
      return
    }
    // SQL changed but still watchable — invalidate the watch so diffs aren't
    // computed against rows from a totally different query shape. The user
    // re-engages watch on the new SQL.
    invalidate(tabId, 'sql_edited')
    watchScheduler.unregister(tabId)
    onSqlInvalidated?.()
  }, [enabled, gate.ok, invalidate, onSqlInvalidated, query, tabId])

  const countdownMs = useCountdown(watchState?.nextTickAt ?? null, paused)
  const lastSnap = watchState?.snapshots[0]
  const totals = watchState?.totals
  const alerts = watchState?.alerts ?? []

  // The countdown hook already forces a re-render every 250ms while
  // watching, so this Date.now() comparison clears itself without a timer.
  const lastAlertFiredAt = alerts.reduce<number>((acc, a) => Math.max(acc, a.lastFiredAt ?? 0), 0)
  const alertFlash = lastAlertFiredAt > 0 && Date.now() - lastAlertFiredAt < ALERT_FLASH_MS

  const draftNeedsValue = ALERT_DRAFT_OPTIONS.find((o) => o.value === draftKind)?.needsValue
  const draftValueNum = Number(draftValue)
  const draftValid = !draftNeedsValue || (Number.isFinite(draftValueNum) && draftValue !== '')

  const handleAddAlert = useCallback(() => {
    if (!draftValid) return
    addAlert(tabId, draftToCondition(draftKind, draftValueNum))
    setDraftValue('')
  }, [addAlert, draftKind, draftValid, draftValueNum, tabId])
  const rowDelta =
    watchState?.snapshots && watchState.snapshots.length >= 2
      ? watchState.snapshots[0].rowCount - watchState.snapshots[1].rowCount
      : 0

  const buttonLabel = useMemo(() => {
    if (!enabled) return 'Watch'
    if (paused) return 'Paused'
    if (held) return 'Held'
    if (countdownMs === null) return 'Watching…'
    const s = Math.ceil(countdownMs / 1000)
    return `Watching · ${s}s`
  }, [enabled, paused, held, countdownMs])

  const cadenceLabel = formatCadence(config.cadenceMs)
  const watchableDisabled = disabled || (!enabled && !gate.ok)

  const holdMessage =
    holdReason === 'cell_editing'
      ? `Grid held while you edit a cell — still polling every ${cadenceLabel}; rows refresh when you finish.`
      : `Grid held: you have uncommitted edits. Still polling every ${cadenceLabel}; rows refresh once you commit or discard.`

  const tooltipMessage = !enabled
    ? gate.ok
      ? 'Watch this query — re-runs on a cadence with live diff (⇧⌘W)'
      : `Watch Mode disabled: ${gate.reason === 'empty' ? 'no query' : (gate.detail ?? gate.reason)}`
    : held
      ? holdMessage
      : `Watching every ${cadenceLabel} · ⇧⌘W to stop`

  return (
    <Popover open={open && enabled} onOpenChange={(o) => enabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={watchableDisabled}
                onClick={() => {
                  if (enabled) {
                    setOpen((o) => !o)
                  } else {
                    handleToggle()
                  }
                }}
                onContextMenu={(e) => {
                  if (!enabled) return
                  e.preventDefault()
                  setOpen(true)
                }}
                className={cn(
                  'gap-1.5 h-7 px-2.5 transition-colors',
                  enabled && !paused && !held && 'text-warning bg-warning/10 hover:bg-warning/15',
                  enabled && (paused || held) && 'text-muted-foreground bg-muted/50',
                  enabled &&
                    alertFlash &&
                    'text-destructive bg-destructive/10 hover:bg-destructive/15'
                )}
                data-watch-active={enabled || undefined}
                data-watch-held={held || undefined}
              >
                {enabled ? (
                  paused ? (
                    <EyeSlashIcon className="size-3.5" />
                  ) : held ? (
                    <PauseIcon className="size-3.5" />
                  ) : alertFlash ? (
                    <BellRingingIcon className="size-3.5" />
                  ) : (
                    <span
                      aria-hidden
                      className="relative inline-flex size-2 items-center justify-center"
                    >
                      <span className="absolute inline-flex size-2 rounded-full bg-warning/40 motion-safe:animate-ping" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-warning" />
                    </span>
                  )
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
                <span className="text-xs font-medium tabular-nums">{buttonLabel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px]">
              <p className="text-xs">{tooltipMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-72 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-3.5 text-warning" />
            <span className="text-xs font-semibold">Watching</span>
          </div>
          <div className="flex items-center gap-2">
            {held && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <PauseIcon className="size-3" />
                grid held
              </span>
            )}
            {lastSnap?.error && (
              <span className="flex items-center gap-1 text-[10px] text-destructive">
                <WarningIcon className="size-3" />
                error
              </span>
            )}
          </div>
        </div>
        {held && <p className="px-3 pt-2 text-[10px] leading-snug text-warning">{holdMessage}</p>}

        <div className="px-3 py-2 space-y-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Cadence
          </span>
          <div className="grid grid-cols-3 gap-1">
            {CADENCE_PRESETS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => {
                  updateConfig(tabId, { cadenceMs: ms })
                  watchScheduler.reschedule(tabId)
                }}
                className={cn(
                  'rounded border px-2 py-1 text-[11px] font-medium transition-colors',
                  config.cadenceMs === ms
                    ? 'border-warning/30 bg-warning/10 text-warning'
                    : 'border-border hover:bg-muted'
                )}
              >
                {formatCadence(ms)}
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between text-xs py-1">
            <span className="text-muted-foreground">Pause when window hidden</span>
            <input
              type="checkbox"
              className="size-3"
              checked={config.pauseWhenHidden}
              onChange={(e) => {
                updateConfig(tabId, { pauseWhenHidden: e.target.checked })
              }}
            />
          </label>
        </div>

        <div className="border-t px-3 py-2 space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Row count
          </span>
          <WatchSparkline points={watchState?.metrics ?? []} />
        </div>

        <div className="border-t px-3 py-2 space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Alerts
          </span>
          {alerts.length > 0 && (
            <ul className="space-y-1">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center gap-1.5 text-xs">
                  <BellRingingIcon
                    className={cn(
                      'size-3 shrink-0',
                      alert.firedCount > 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  />
                  <span className="flex-1 truncate">{describeAlertCondition(alert.condition)}</span>
                  {alert.firedCount > 0 && (
                    <span className="tabular-nums text-[10px] text-destructive">
                      {alert.firedCount}×
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Remove alert"
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => removeAlert(tabId, alert.id)}
                  >
                    <TrashIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1">
            <select
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value as AlertDraftKind)}
              className="h-6 flex-1 rounded border bg-transparent px-1 text-[11px]"
              aria-label="Alert condition"
            >
              {ALERT_DRAFT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {draftNeedsValue && (
              <input
                type="number"
                min={0}
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddAlert()
                }}
                placeholder="100"
                aria-label="Alert threshold"
                className="h-6 w-16 rounded border bg-transparent px-1.5 text-[11px] tabular-nums"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={!draftValid}
              onClick={handleAddAlert}
              aria-label="Add alert"
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Fires an OS notification. Thresholds re-arm when the condition clears.
          </p>
        </div>

        <div className="border-t px-3 py-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
          <div>
            <div className="text-foreground tabular-nums text-sm font-medium">
              {totals?.ticksRun ?? 0}
            </div>
            <div>ticks</div>
          </div>
          <div>
            <div
              className={cn(
                'text-foreground tabular-nums text-sm font-medium',
                rowDelta > 0 && 'text-success',
                rowDelta < 0 && 'text-destructive'
              )}
            >
              {rowDelta > 0 ? '+' : ''}
              {rowDelta}
            </div>
            <div>row Δ</div>
          </div>
          <div>
            <div className="text-foreground tabular-nums text-sm font-medium">
              {totals?.cellsChangedCumulative ?? 0}
            </div>
            <div>cells</div>
          </div>
        </div>

        <div className="border-t px-2 py-2 flex items-center gap-1">
          {paused ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 flex-1"
              onClick={() => {
                resume(tabId)
                watchScheduler.triggerNow(tabId)
              }}
            >
              <PlayIcon className="size-3.5" />
              Resume
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 flex-1"
              onClick={() => pause(tabId)}
            >
              <PauseIcon className="size-3.5" />
              Pause
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => watchScheduler.triggerNow(tabId)}
            title="Run now (⇧⌘0)"
          >
            <RefreshIcon className="size-3.5" />
            Run
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-destructive hover:text-destructive"
            onClick={() => {
              stop(tabId)
              watchScheduler.unregister(tabId)
              setOpen(false)
            }}
          >
            <StopIcon className="size-3.5" />
            Stop
            <kbd className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
              {keys.mod}
              {keys.shift}W
            </kbd>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
