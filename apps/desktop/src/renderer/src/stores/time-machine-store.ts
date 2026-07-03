/**
 * Time Machine store.
 *
 * Per-tab state for browsing persisted result history. Payloads live in the
 * main process (better-sqlite3); this store caches run metadata for the tab's
 * current query fingerprint plus at most two loaded snapshots (the one being
 * viewed and, in diff mode, the older side's rows are folded into the diff).
 *
 * Diffs are always computed between two persisted snapshots — never against
 * the live result — so both sides share the capture-time value normalization
 * and timestamp cells don't spuriously light up.
 */

import { create } from 'zustand'
import type { TimeMachineRunMeta, TimeMachineSnapshot } from '@data-peek/shared'
import { TM_MAX_RUNS_PER_QUERY } from '@data-peek/shared'
import type { WatchDiff } from '@/lib/watch-types'
import type { KeyingPlan } from '@/lib/watch-row-keying'
import { computeDiff } from '@/lib/watch-diff'
import { recordsFromColumnar } from '@/lib/time-machine-payload'

export interface TabTimeMachineState {
  open: boolean
  fingerprint: string | null
  runs: TimeMachineRunMeta[]
  /** Run being viewed; in diff mode this is the newer side. null = live result. */
  selectedRunId: string | null
  /** Older side of a diff; non-null implies diff mode. */
  compareRunId: string | null
  snapshot: TimeMachineSnapshot | null
  diff: WatchDiff | null
  isLoading: boolean
  error: string | null
}

interface TimeMachineStore {
  states: Record<string, TabTimeMachineState>

  openStrip: (tabId: string) => void
  closeStrip: (tabId: string) => void
  /** Fetch run metadata for the tab's current SQL. Safe to call repeatedly. */
  loadRuns: (tabId: string, connectionId: string, sql: string) => Promise<void>
  /** View a single past run read-only. null returns to the live result. */
  selectRun: (tabId: string, runId: string | null) => Promise<void>
  /** Diff the given run against the currently selected one (order-insensitive). */
  selectCompare: (tabId: string, runId: string) => Promise<void>
  backToLive: (tabId: string) => void
  /** Prepend a freshly captured run (called by the capture path). */
  applyCapture: (tabId: string, meta: TimeMachineRunMeta) => void
  deleteRun: (tabId: string, runId: string) => Promise<void>
  /** Drop all state for a tab (tab closed). */
  stop: (tabId: string) => void

  getState: (tabId: string) => TabTimeMachineState | null
}

function makeInitialState(): TabTimeMachineState {
  return {
    open: true,
    fingerprint: null,
    runs: [],
    selectedRunId: null,
    compareRunId: null,
    snapshot: null,
    diff: null,
    isLoading: false,
    error: null
  }
}

// Monotonic token per tab so a slow listRuns/getSnapshot response can't
// clobber state written by a newer request (same idea as the executionId
// guard on query runs).
const loadSeq = new Map<string, number>()

function nextSeq(tabId: string): number {
  const next = (loadSeq.get(tabId) ?? 0) + 1
  loadSeq.set(tabId, next)
  return next
}

function isCurrentSeq(tabId: string, seq: number): boolean {
  return loadSeq.get(tabId) === seq
}

/**
 * Both runs must agree on an explicit key plan for a PK-keyed diff; otherwise
 * fall back to position keying (the differ requires one plan for both sides).
 */
function sharedKeyingPlan(newer: TimeMachineRunMeta, older: TimeMachineRunMeta): KeyingPlan {
  const samePlan =
    newer.keyStrategy === older.keyStrategy &&
    newer.keyColumns.length === older.keyColumns.length &&
    newer.keyColumns.every((c, i) => c === older.keyColumns[i])
  if (samePlan && newer.keyStrategy === 'primary_key') {
    return { strategy: 'primary_key', keyColumns: newer.keyColumns }
  }
  return { strategy: 'row_position', keyColumns: [] }
}

async function fetchSnapshot(id: string): Promise<TimeMachineSnapshot> {
  const response = await window.api.timeMachine.getSnapshot(id)
  if (!response.success || !response.data) {
    throw new Error(response.error ?? 'Failed to load snapshot')
  }
  return response.data
}

export const useTimeMachineStore = create<TimeMachineStore>((set, get) => ({
  states: {},

  openStrip: (tabId) => {
    set((s) => {
      const cur = s.states[tabId]
      if (cur?.open) return s
      return {
        states: {
          ...s.states,
          [tabId]: cur ? { ...cur, open: true } : makeInitialState()
        }
      }
    })
  },

  closeStrip: (tabId) => {
    set((s) => {
      const cur = s.states[tabId]
      if (!cur || !cur.open) return s
      // Closing the strip always returns to the live result — leaving the grid
      // silently pinned to the past with no visible strip would be a trap.
      return {
        states: {
          ...s.states,
          [tabId]: {
            ...cur,
            open: false,
            selectedRunId: null,
            compareRunId: null,
            snapshot: null,
            diff: null,
            error: null
          }
        }
      }
    })
  },

  loadRuns: async (tabId, connectionId, sql) => {
    const seq = nextSeq(tabId)
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      return { states: { ...s.states, [tabId]: { ...cur, isLoading: true, error: null } } }
    })
    try {
      const response = await window.api.timeMachine.listRuns(connectionId, sql)
      if (!isCurrentSeq(tabId, seq)) return
      set((s) => {
        const cur = s.states[tabId]
        if (!cur) return s
        if (!response.success || !response.data) {
          return {
            states: {
              ...s.states,
              [tabId]: {
                ...cur,
                isLoading: false,
                error: response.error ?? 'Failed to load run history'
              }
            }
          }
        }
        const { fingerprint, runs } = response.data
        const selectionSurvives =
          cur.selectedRunId !== null && runs.some((r) => r.id === cur.selectedRunId)
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...cur,
              isLoading: false,
              fingerprint,
              runs,
              selectedRunId: selectionSurvives ? cur.selectedRunId : null,
              compareRunId: selectionSurvives ? cur.compareRunId : null,
              snapshot: selectionSurvives ? cur.snapshot : null,
              diff: selectionSurvives ? cur.diff : null
            }
          }
        }
      })
    } catch (err) {
      if (!isCurrentSeq(tabId, seq)) return
      set((s) => {
        const cur = s.states[tabId]
        if (!cur) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...cur,
              isLoading: false,
              error: err instanceof Error ? err.message : String(err)
            }
          }
        }
      })
    }
  },

  selectRun: async (tabId, runId) => {
    if (runId === null) {
      get().backToLive(tabId)
      return
    }
    const cur = get().states[tabId]
    if (!cur) return
    const run = cur.runs.find((r) => r.id === runId)
    if (!run || !run.hasRows) return
    const seq = nextSeq(tabId)
    set((s) => {
      const st = s.states[tabId]
      if (!st) return s
      return {
        states: {
          ...s.states,
          [tabId]: { ...st, isLoading: true, error: null }
        }
      }
    })
    try {
      const snapshot = await fetchSnapshot(runId)
      if (!isCurrentSeq(tabId, seq)) return
      set((s) => {
        const st = s.states[tabId]
        if (!st) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...st,
              isLoading: false,
              selectedRunId: runId,
              compareRunId: null,
              snapshot,
              diff: null
            }
          }
        }
      })
    } catch (err) {
      if (!isCurrentSeq(tabId, seq)) return
      set((s) => {
        const st = s.states[tabId]
        if (!st) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...st,
              isLoading: false,
              error: err instanceof Error ? err.message : String(err)
            }
          }
        }
      })
    }
  },

  selectCompare: async (tabId, runId) => {
    const cur = get().states[tabId]
    if (!cur || cur.selectedRunId === null || runId === cur.selectedRunId) return
    const a = cur.runs.find((r) => r.id === cur.selectedRunId)
    const b = cur.runs.find((r) => r.id === runId)
    if (!a || !b || !a.hasRows || !b.hasRows) return
    const [older, newer] = a.capturedAt <= b.capturedAt ? [a, b] : [b, a]
    const seq = nextSeq(tabId)
    set((s) => {
      const st = s.states[tabId]
      if (!st) return s
      return { states: { ...s.states, [tabId]: { ...st, isLoading: true, error: null } } }
    })
    try {
      const [olderSnap, newerSnap] = await Promise.all([
        fetchSnapshot(older.id),
        fetchSnapshot(newer.id)
      ])
      if (!isCurrentSeq(tabId, seq)) return
      const plan = sharedKeyingPlan(newer, older)
      const diff = computeDiff({
        previous: {
          rows: recordsFromColumnar(olderSnap.columns, olderSnap.rows),
          keyingPlan: plan
        },
        next: {
          rows: recordsFromColumnar(newerSnap.columns, newerSnap.rows),
          keyingPlan: plan,
          fieldNames: newerSnap.columns.map((c) => c.name)
        },
        now: Date.now(),
        carryFromPrevious: null,
        // Diff highlights are pinned, not fading — this keeps the overlay's
        // opacity math at ~1 without a dedicated no-fade mode.
        fadeMs: Number.MAX_SAFE_INTEGER
      })
      set((s) => {
        const st = s.states[tabId]
        if (!st) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...st,
              isLoading: false,
              selectedRunId: newer.id,
              compareRunId: older.id,
              snapshot: newerSnap,
              diff
            }
          }
        }
      })
    } catch (err) {
      if (!isCurrentSeq(tabId, seq)) return
      set((s) => {
        const st = s.states[tabId]
        if (!st) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...st,
              isLoading: false,
              error: err instanceof Error ? err.message : String(err)
            }
          }
        }
      })
    }
  },

  backToLive: (tabId) => {
    nextSeq(tabId)
    set((s) => {
      const cur = s.states[tabId]
      if (!cur) return s
      if (cur.selectedRunId === null && !cur.isLoading && cur.error === null) return s
      return {
        states: {
          ...s.states,
          [tabId]: {
            ...cur,
            selectedRunId: null,
            compareRunId: null,
            snapshot: null,
            diff: null,
            isLoading: false,
            error: null
          }
        }
      }
    })
  },

  applyCapture: (tabId, meta) => {
    const cur = get().states[tabId]
    if (!cur) return
    if (cur.fingerprint === meta.fingerprint) {
      set((s) => {
        const st = s.states[tabId]
        if (!st) return s
        return {
          states: {
            ...s.states,
            [tabId]: {
              ...st,
              runs: [meta, ...st.runs].slice(0, TM_MAX_RUNS_PER_QUERY)
            }
          }
        }
      })
      return
    }
    // Different fingerprint — the SQL changed since the strip loaded. Reload
    // the full timeline for the new query rather than showing a lone run.
    void get().loadRuns(tabId, meta.connectionId, meta.sql)
  },

  deleteRun: async (tabId, runId) => {
    const cur = get().states[tabId]
    if (!cur) return
    const wasViewing = cur.selectedRunId === runId || cur.compareRunId === runId
    set((s) => {
      const st = s.states[tabId]
      if (!st) return s
      const runs = st.runs.filter((r) => r.id !== runId)
      if (runs.length === st.runs.length) return s
      return {
        states: {
          ...s.states,
          [tabId]: wasViewing
            ? {
                ...st,
                runs,
                selectedRunId: null,
                compareRunId: null,
                snapshot: null,
                diff: null
              }
            : { ...st, runs }
        }
      }
    })
    try {
      await window.api.timeMachine.deleteRun(runId)
    } catch (err) {
      console.error('Failed to delete Time Machine run', err)
    }
  },

  stop: (tabId) => {
    loadSeq.delete(tabId)
    set((s) => {
      if (!(tabId in s.states)) return s
      const next = { ...s.states }
      delete next[tabId]
      return { states: next }
    })
  },

  getState: (tabId) => get().states[tabId] ?? null
}))
