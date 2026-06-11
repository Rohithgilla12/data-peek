/**
 * Watch Alerts — pure evaluation logic, no timers, no notifications.
 *
 * Two firing models:
 *
 *   - Threshold conditions (`row_count`, `query_errors`) are edge-triggered.
 *     They fire once when the condition becomes true and re-arm when it
 *     stops holding, so "rows > 100" doesn't re-fire on every tick the
 *     count stays above 100.
 *
 *   - Event conditions (`row_count_changes`, `any_change`) describe a
 *     moment, not a state — they'd be true on every busy tick. They fire at
 *     most once per EVENT_ALERT_COOLDOWN_MS.
 *
 * The scheduler calls evaluateAlerts after every tick; side effects
 * (notifications, store commits) live with the caller.
 */

import type { WatchAlert, WatchAlertCondition, WatchDiff, WatchSnapshot } from './watch-types'
import { EVENT_ALERT_COOLDOWN_MS } from './watch-types'

export interface AlertEvalContext {
  snapshot: WatchSnapshot
  /** Previous successful snapshot, if any. */
  previous: WatchSnapshot | null
  /** Diff computed for this tick (null on the first tick). */
  diff: WatchDiff | null
  /** Wall-clock ms — injected for testability. */
  now: number
}

export interface AlertEvalResult {
  /** All alerts with updated armed/firedCount/lastFiredAt state. */
  alerts: WatchAlert[]
  /** The subset that fired this tick (same object references as `alerts`). */
  fired: WatchAlert[]
}

let alertIdCounter = 0

export function makeAlert(condition: WatchAlertCondition, now: number): WatchAlert {
  alertIdCounter += 1
  return {
    id: `wa-${now.toString(36)}-${alertIdCounter}`,
    condition,
    armed: true,
    firedCount: 0,
    lastFiredAt: null,
    createdAt: now
  }
}

function isEventCondition(condition: WatchAlertCondition): boolean {
  return condition.kind === 'row_count_changes' || condition.kind === 'any_change'
}

/** Fresh activity in this tick's diff: changed cells plus row adds/removals. */
function freshChangeCount(diff: WatchDiff | null): number {
  if (!diff) return 0
  let fresh = 0
  for (const cell of diff.cells.values()) {
    if (cell.changedAt === diff.computedAt) fresh += 1
  }
  return fresh + diff.addedRowKeys.size + diff.removedRowKeys.size
}

export function conditionHolds(condition: WatchAlertCondition, ctx: AlertEvalContext): boolean {
  switch (condition.kind) {
    case 'row_count': {
      // An errored tick reports rowCount 0 — comparing against that would
      // make "rows < 5" fire on a transient connection blip.
      if (ctx.snapshot.error) return false
      const n = ctx.snapshot.rowCount
      switch (condition.op) {
        case 'gt':
          return n > condition.value
        case 'lt':
          return n < condition.value
        case 'eq':
          return n === condition.value
        case 'neq':
          return n !== condition.value
      }
      return false
    }
    case 'row_count_changes':
      return (
        !!ctx.previous &&
        !ctx.previous.error &&
        !ctx.snapshot.error &&
        ctx.previous.rowCount !== ctx.snapshot.rowCount
      )
    case 'any_change':
      return freshChangeCount(ctx.diff) > 0
    case 'query_errors':
      return ctx.snapshot.error !== null
  }
}

export function evaluateAlerts(
  alerts: ReadonlyArray<WatchAlert>,
  ctx: AlertEvalContext
): AlertEvalResult {
  const fired: WatchAlert[] = []
  const next = alerts.map((alert) => {
    const holds = conditionHolds(alert.condition, ctx)

    if (isEventCondition(alert.condition)) {
      if (!holds) return alert
      const cooledDown =
        alert.lastFiredAt === null || ctx.now - alert.lastFiredAt >= EVENT_ALERT_COOLDOWN_MS
      if (!cooledDown) return alert
      const updated: WatchAlert = {
        ...alert,
        firedCount: alert.firedCount + 1,
        lastFiredAt: ctx.now
      }
      fired.push(updated)
      return updated
    }

    // Threshold-style: fire on the false→true edge, re-arm on false.
    if (!holds) {
      return alert.armed ? alert : { ...alert, armed: true }
    }
    if (!alert.armed) return alert
    const updated: WatchAlert = {
      ...alert,
      armed: false,
      firedCount: alert.firedCount + 1,
      lastFiredAt: ctx.now
    }
    fired.push(updated)
    return updated
  })
  return { alerts: next, fired }
}

export function describeAlertCondition(condition: WatchAlertCondition): string {
  switch (condition.kind) {
    case 'row_count': {
      const op = { gt: '>', lt: '<', eq: '=', neq: '≠' }[condition.op]
      return `rows ${op} ${condition.value}`
    }
    case 'row_count_changes':
      return 'row count changes'
    case 'any_change':
      return 'anything changes'
    case 'query_errors':
      return 'query errors'
  }
}
