/**
 * Time Machine capture — decides whether a completed run is snapshot-worthy
 * and ships it to the main process.
 *
 * Capture hooks into the manual-run success path only. Watch ticks, notebook
 * cells, AI runs and table-preview page flips all reach the database through
 * other code paths, so they are excluded by construction, not by filtering.
 */

import type { StatementResult, TimeMachineCapturePayload } from '@data-peek/shared'
import { TM_MAX_SNAPSHOT_ROWS } from '@data-peek/shared'
import { gateForWatch } from './watch-sql-gate'
import { pickKeyingPlan } from './watch-row-keying'
import { toColumnarRows } from './time-machine-payload'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { useTabStore } from '@/stores/tab-store'

export interface BuildCaptureInput {
  enabled: boolean
  tabType: string
  connectionId: string
  /** The user's typed SQL — fingerprinted main-side, shown in the timeline. */
  sql: string
  statements: ReadonlyArray<StatementResult>
  /** Explicit PK columns from the schema cache, when resolvable. */
  explicitKeyColumns: ReadonlyArray<string> | undefined
  maskedColumns: ReadonlySet<string>
  capturedAt: number
}

/**
 * Returns null when the run isn't eligible: feature off, not a query tab,
 * not a single-statement pure SELECT, or no data-returning result.
 */
export function buildCapturePayload(input: BuildCaptureInput): TimeMachineCapturePayload | null {
  if (!input.enabled) return null
  if (input.tabType !== 'query') return null
  if (!gateForWatch(input.sql).ok) return null

  const dataStatements = input.statements.filter((s) => s.isDataReturning)
  if (dataStatements.length !== 1) return null
  const statement = dataStatements[0]

  const fieldNames = statement.fields.map((f) => f.name)
  const plan = pickKeyingPlan({
    explicitKeyColumns: input.explicitKeyColumns,
    fieldNames
  })

  const totalRows = statement.rows.length
  const cappedRows =
    totalRows > TM_MAX_SNAPSHOT_ROWS
      ? statement.rows.slice(0, TM_MAX_SNAPSHOT_ROWS)
      : statement.rows

  return {
    connectionId: input.connectionId,
    sql: input.sql,
    capturedAt: input.capturedAt,
    durationMs: statement.durationMs,
    rowCount: statement.rowCount || totalRows,
    truncated: cappedRows.length < totalRows,
    keyStrategy: plan.strategy,
    keyColumns: [...plan.keyColumns],
    columns: statement.fields.map((f) => ({ name: f.name, dataType: f.dataType })),
    rows: toColumnarRows(
      cappedRows as ReadonlyArray<Record<string, unknown>>,
      fieldNames,
      input.maskedColumns
    )
  }
}

/**
 * Fire-and-forget: never blocks or fails the run that produced the result.
 * On success the tab's open timeline (if any) is updated in place.
 */
export function captureRun(tabId: string, input: BuildCaptureInput): void {
  const payload = buildCapturePayload(input)
  if (!payload) return
  ensureTimeMachineTabListener()
  window.api.timeMachine
    .capture(payload)
    .then((response) => {
      if (response.success && response.data) {
        useTimeMachineStore.getState().applyCapture(tabId, response.data)
      }
    })
    .catch((err) => console.error('Time Machine capture failed', err))
}

let tabListenerSetup = false

/**
 * Tab-store close cleanup, same pattern as the watch scheduler: tab-store
 * never notifies satellites, so we diff live tab ids ourselves.
 */
export function ensureTimeMachineTabListener(): void {
  if (tabListenerSetup) return
  tabListenerSetup = true
  useTabStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return
    const live = new Set(state.tabs.map((t) => t.id))
    const tm = useTimeMachineStore.getState()
    for (const tabId of Object.keys(tm.states)) {
      if (!live.has(tabId)) tm.stop(tabId)
    }
  })
}
