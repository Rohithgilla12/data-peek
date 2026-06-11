/**
 * Watch Mode — public types shared by the store, scheduler, differ, and UI.
 *
 * Keeping these in `lib/` (not `@data-peek/shared`) because Watch Mode is a
 * renderer-only concern — the IPC contract doesn't change. If we ever push
 * polling into the main process, we can lift these into shared.
 */

export interface WatchConfig {
  /** How often the query re-runs, in milliseconds. */
  cadenceMs: number
  /** Pause polling while the host window is hidden (default true). */
  pauseWhenHidden: boolean
  /** Cap the snapshot history kept in memory (default 6 — enough for fade). */
  historyLimit: number
  /** How long a "changed" diff stays visible before fading (default 8000ms). */
  fadeMs: number
}

export interface WatchSnapshot {
  /** Monotonically increasing tick counter for this watch session. */
  tick: number
  /** Wall-clock time when the snapshot's query returned. */
  capturedAt: number
  /** Result row count at this tick. */
  rowCount: number
  /** Duration in ms for the query execution that produced this snapshot. */
  durationMs: number
  /** Error if the run failed (watch continues so you see when it recovers). */
  error: string | null
  /** Rows + field metadata captured at this tick (omitted on error). */
  rows: ReadonlyArray<Record<string, unknown>>
  fields: ReadonlyArray<{ name: string; dataType: string }>
}

export type CellDiffKind = 'unchanged' | 'changed' | 'added' | 'removed'

export interface CellDiff {
  kind: CellDiffKind
  previousValue?: unknown
  /** Wall-clock ms when this cell last changed — used to fade out stale diffs. */
  changedAt: number
}

export type WatchKeyStrategy = 'primary_key' | 'row_position'

export interface WatchDiff {
  /** Map of "rowKey:columnName" → CellDiff for the latest snapshot. */
  cells: Map<string, CellDiff>
  /** Row keys present in the new snapshot but not the previous. */
  addedRowKeys: Set<string>
  /** Row keys present in the previous snapshot but not the new. */
  removedRowKeys: Set<string>
  /** Strategy used to derive row keys for this query. */
  keyingStrategy: WatchKeyStrategy
  /** Column(s) used as the row key when strategy is `primary_key`. */
  keyColumns: ReadonlyArray<string>
  /** Wall-clock ms when this diff was computed. */
  computedAt: number
}

/**
 * One lightweight data point per tick, kept far longer than full snapshots.
 * Snapshots carry full row payloads so they're capped at ~6; metrics are five
 * numbers so we can afford a couple of minutes of trend history for the
 * sparkline. Stored oldest-first (append order) unlike `snapshots`.
 */
export interface WatchMetricPoint {
  tick: number
  capturedAt: number
  rowCount: number
  durationMs: number
  errored: boolean
}

export type WatchAlertCondition =
  | { kind: 'row_count'; op: 'gt' | 'lt' | 'eq' | 'neq'; value: number }
  | { kind: 'row_count_changes' }
  | { kind: 'any_change' }
  | { kind: 'query_errors' }

export interface WatchAlert {
  id: string
  condition: WatchAlertCondition
  /**
   * Edge-trigger state for threshold-style conditions (`row_count`,
   * `query_errors`): fires only on the false→true transition, re-arms when
   * the condition stops holding. Event-style conditions ignore this and use
   * the cooldown instead.
   */
  armed: boolean
  firedCount: number
  lastFiredAt: number | null
  createdAt: number
}

export interface WatchTotals {
  ticksRun: number
  ticksFailed: number
  cellsChangedCumulative: number
  rowsAddedCumulative: number
  rowsRemovedCumulative: number
}

export interface TabWatchState {
  enabled: boolean
  paused: boolean
  config: WatchConfig
  /** When the next tick is scheduled to fire (wall-clock ms). */
  nextTickAt: number | null
  /** Snapshot history, newest first, capped at config.historyLimit. */
  snapshots: WatchSnapshot[]
  /** Diff between the two most recent snapshots; null until 2nd snapshot lands. */
  diff: WatchDiff | null
  totals: WatchTotals
  /** Per-tick trend history, oldest-first, capped at METRICS_HISTORY_LIMIT. */
  metrics: WatchMetricPoint[]
  /** User-defined alerts evaluated after every tick. */
  alerts: WatchAlert[]
  /** Last reason the watch was invalidated, if any. */
  invalidatedReason: 'sql_edited' | 'connection_changed' | 'destructive_sql' | null
}

export const DEFAULT_WATCH_CONFIG: WatchConfig = {
  cadenceMs: 5000,
  pauseWhenHidden: true,
  historyLimit: 6,
  fadeMs: 8000
}

/** Cadence presets surfaced in the picker, in milliseconds. */
export const CADENCE_PRESETS_MS = [
  500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 300_000
] as const

/** Hard floor — refuse to schedule below this regardless of config. */
export const CADENCE_FLOOR_MS = 250

/** Trend history cap — at the default 5s cadence this is ~10 minutes. */
export const METRICS_HISTORY_LIMIT = 120

/**
 * Minimum gap between fires for event-style alerts (`row_count_changes`,
 * `any_change`). Without this a 500ms cadence on a busy table would fire an
 * OS notification twice a second.
 */
export const EVENT_ALERT_COOLDOWN_MS = 10_000
