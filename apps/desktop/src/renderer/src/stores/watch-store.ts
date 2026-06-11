/**
 * Watch Mode store.
 *
 * Per-tab state for a pinned, polling SELECT. The store owns *state*; the
 * scheduler (lib/watch-scheduler.ts) owns the *timers*. Splitting these
 * keeps timer accuracy from being coupled to React re-render cycles, and
 * lets the differ produce diffs without going through React state.
 *
 * Snapshots are session-only — restarting the app means starting fresh.
 * The cost of saving 10 snapshots × N watched tabs to disk is more than
 * the value of cross-restart continuity.
 */

import { create } from 'zustand'
import type {
  TabWatchState,
  WatchAlert,
  WatchAlertCondition,
  WatchConfig,
  WatchMetricPoint,
  WatchSnapshot,
  WatchDiff
} from '@/lib/watch-types'
import { CADENCE_FLOOR_MS, DEFAULT_WATCH_CONFIG, METRICS_HISTORY_LIMIT } from '@/lib/watch-types'
import { makeAlert } from '@/lib/watch-alerts'

interface WatchStore {
  states: Record<string, TabWatchState>

  /** Start watching with the given config (or defaults). */
  start: (tabId: string, config?: Partial<WatchConfig>) => void
  /** Stop watching and clear all snapshots/diff. */
  stop: (tabId: string) => void
  /** Pause polling without losing history. */
  pause: (tabId: string) => void
  /** Resume polling — scheduler will fire one tick immediately. */
  resume: (tabId: string) => void
  /** Merge a config patch (clamped to floor). */
  updateConfig: (tabId: string, partial: Partial<WatchConfig>) => void
  /** Set the next-tick wall-clock time (called by the scheduler). */
  setNextTickAt: (tabId: string, at: number | null) => void
  /** Apply a new snapshot + diff (called by the scheduler after each tick). */
  applyTick: (tabId: string, snapshot: WatchSnapshot, diff: WatchDiff) => void
  /** Add a user-defined alert. */
  addAlert: (tabId: string, condition: WatchAlertCondition) => void
  /** Remove an alert by id. */
  removeAlert: (tabId: string, alertId: string) => void
  /** Commit alert state updated by the evaluator (called by the scheduler). */
  setAlerts: (tabId: string, alerts: WatchAlert[]) => void
  /** Soft-cancel: clear state because the user edited SQL or changed conn. */
  invalidate: (
    tabId: string,
    reason: 'sql_edited' | 'connection_changed' | 'destructive_sql'
  ) => void

  getState: (tabId: string) => TabWatchState | null
  isWatching: (tabId: string) => boolean
}

function makeInitialState(config: WatchConfig): TabWatchState {
  return {
    enabled: true,
    paused: false,
    config,
    nextTickAt: null,
    snapshots: [],
    diff: null,
    totals: {
      ticksRun: 0,
      ticksFailed: 0,
      cellsChangedCumulative: 0,
      rowsAddedCumulative: 0,
      rowsRemovedCumulative: 0
    },
    metrics: [],
    alerts: [],
    invalidatedReason: null
  }
}

function clampConfig(partial: Partial<WatchConfig>, base: WatchConfig): WatchConfig {
  const merged = { ...base, ...partial }
  // Number.isFinite filters NaN, +Infinity, -Infinity. typeof alone accepts
  // those — and `{ cadenceMs: NaN }` would poison the scheduler with
  // `Math.max(250, NaN) === NaN`, busy-looping setTimeout. Fall back to the
  // prior base value so the watch stays sane.
  if (typeof merged.cadenceMs === 'number' && Number.isFinite(merged.cadenceMs)) {
    merged.cadenceMs = Math.max(CADENCE_FLOOR_MS, Math.round(merged.cadenceMs))
  } else {
    merged.cadenceMs = base.cadenceMs
  }
  if (typeof merged.historyLimit === 'number' && Number.isFinite(merged.historyLimit)) {
    merged.historyLimit = Math.max(2, Math.min(50, Math.round(merged.historyLimit)))
  } else {
    merged.historyLimit = base.historyLimit
  }
  if (typeof merged.fadeMs === 'number' && Number.isFinite(merged.fadeMs)) {
    merged.fadeMs = Math.max(0, Math.round(merged.fadeMs))
  } else {
    merged.fadeMs = base.fadeMs
  }
  return merged
}

export const useWatchStore = create<WatchStore>((set, get) => ({
  states: {},

  start: (tabId, partial) => {
    const config = clampConfig(partial ?? {}, DEFAULT_WATCH_CONFIG)
    set((s) => ({
      states: {
        ...s.states,
        [tabId]: makeInitialState(config)
      }
    }))
  },

  stop: (tabId) => {
    set((s) => {
      if (!(tabId in s.states)) return s
      const next = { ...s.states }
      delete next[tabId]
      return { states: next }
    })
  },

  pause: (tabId) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur || cur.paused) return s
      return {
        states: {
          ...s.states,
          [tabId]: { ...cur, paused: true, nextTickAt: null }
        }
      }
    })
  },

  resume: (tabId) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur || !cur.paused) return s
      return {
        states: {
          ...s.states,
          [tabId]: { ...cur, paused: false }
        }
      }
    })
  },

  updateConfig: (tabId, partial) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      const config = clampConfig(partial, cur.config)
      return {
        states: {
          ...s.states,
          [tabId]: { ...cur, config }
        }
      }
    })
  },

  setNextTickAt: (tabId, at) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      if (cur.nextTickAt === at) return s
      return {
        states: { ...s.states, [tabId]: { ...cur, nextTickAt: at } }
      }
    })
  },

  applyTick: (tabId, snapshot, diff) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      const snapshots = [snapshot, ...cur.snapshots].slice(0, cur.config.historyLimit)
      const totals = { ...cur.totals }
      totals.ticksRun += 1
      if (snapshot.error) totals.ticksFailed += 1
      // Count only freshly-changed cells (changedAt === diff.computedAt) so a
      // carried-forward diff doesn't double-count.
      let freshlyChanged = 0
      for (const v of diff.cells.values()) {
        if (v.changedAt === diff.computedAt) freshlyChanged += 1
      }
      totals.cellsChangedCumulative += freshlyChanged
      totals.rowsAddedCumulative += diff.addedRowKeys.size
      totals.rowsRemovedCumulative += diff.removedRowKeys.size
      const metric: WatchMetricPoint = {
        tick: snapshot.tick,
        capturedAt: snapshot.capturedAt,
        rowCount: snapshot.rowCount,
        durationMs: snapshot.durationMs,
        errored: snapshot.error !== null
      }
      const metrics = [...cur.metrics, metric].slice(-METRICS_HISTORY_LIMIT)
      return {
        states: {
          ...s.states,
          [tabId]: { ...cur, snapshots, diff, totals, metrics }
        }
      }
    })
  },

  addAlert: (tabId, condition) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      return {
        states: {
          ...s.states,
          [tabId]: { ...cur, alerts: [...cur.alerts, makeAlert(condition, Date.now())] }
        }
      }
    })
  },

  removeAlert: (tabId, alertId) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      const alerts = cur.alerts.filter((a) => a.id !== alertId)
      if (alerts.length === cur.alerts.length) return s
      return {
        states: { ...s.states, [tabId]: { ...cur, alerts } }
      }
    })
  },

  setAlerts: (tabId, alerts) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      return {
        states: { ...s.states, [tabId]: { ...cur, alerts } }
      }
    })
  },

  invalidate: (tabId, reason) => {
    set((s) => {
      if (!(tabId in s.states)) return s
      const next = { ...s.states }
      // Keep a tombstone for one render so the UI can show "watch cleared
      // because SQL changed" before the next mount.
      const cur = next[tabId]
      next[tabId] = {
        ...cur,
        enabled: false,
        paused: true,
        nextTickAt: null,
        invalidatedReason: reason
      }
      return { states: next }
    })
    // Then drop the tombstone on the next tick of the event loop. The
    // scheduler unregisters in response to `enabled: false`.
    setTimeout(() => {
      const cur = get().states[tabId]
      if (cur && !cur.enabled) {
        set((s) => {
          if (!(tabId in s.states)) return s
          const next = { ...s.states }
          delete next[tabId]
          return { states: next }
        })
      }
    }, 800)
  },

  getState: (tabId) => get().states[tabId] ?? null,

  isWatching: (tabId) => {
    const st = get().states[tabId]
    return !!st && st.enabled
  }
}))
