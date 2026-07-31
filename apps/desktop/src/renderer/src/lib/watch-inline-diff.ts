/**
 * Inline diff decoration for non-virtualized grids.
 *
 * One visual feature, two painters — deliberately, because they solve
 * different problems:
 *
 *   1. `components/cell-grid/watch-decoration-overlay.tsx` stacks
 *      absolutely-positioned rectangles on top of the grid using the
 *      virtualizer's geometry (measured column offsets, row offsets). It can
 *      fade a highlight out over `fadeMs`, but it only exists above
 *      VIRTUALIZATION_THRESHOLD — below the threshold no geometry is measured,
 *      so there is nothing to position against.
 *
 *   2. This module, which sets a plain `backgroundColor` on the real
 *      `<tr>`/`<td>` the grid already renders. It needs no geometry, so it is
 *      the only option below the threshold — which is where nearly every real
 *      query lands. It has no fade: a highlight persists until a later tick's
 *      diff drops it (`computeDiff` prunes carried cells older than `fadeMs`),
 *      so a change stays lit for one cadence beyond the fade window instead of
 *      dimming out inside it.
 *
 * Both read the same `WatchDiff` and the same `--cell-diff-*` custom
 * properties, so they look the same. Which one runs is purely a function of
 * `shouldVirtualize`, and they are mutually exclusive — see the call sites in
 * `data-table.tsx` and `editable-data-table.tsx`.
 */

import type { WatchDiff } from './watch-types'
import { cellKey, deriveRowKey, type KeyingPlan } from './watch-row-keying'

/** Green band for a row that is new in this snapshot. */
export const INLINE_ADDED_ROW_STYLE: Readonly<{ backgroundColor: string }> = {
  backgroundColor: 'var(--cell-diff-added)'
}

/** Amber fill for a cell whose value changed in this snapshot. */
export const INLINE_CHANGED_CELL_STYLE: Readonly<{ backgroundColor: string }> = {
  backgroundColor: 'var(--cell-diff-fill)'
}

/** The slice of `TabWatchState` the inline path needs. */
export interface InlineWatchSource {
  enabled: boolean
  diff: WatchDiff | null
}

/**
 * Whether a grid is showing a pinned, historical result rather than the tab's
 * live one. Read from the tri-state of `DataTable`'s `diffOverlay` prop, which
 * has to distinguish a pinned view from a live one even when the pinned view
 * has nothing to compare against:
 *
 *   - `undefined` — live grid. Watch Mode decorations apply.
 *   - `null` — pinned view (Time Machine) with a single run selected and
 *     nothing to diff. Watch decorations must NOT apply: they describe the live
 *     rows, which are not the ones on screen.
 *   - a `WatchDiff` — pinned view in compare mode; paint that diff.
 */
export function isPinnedDiffView(diffOverlay: WatchDiff | null | undefined): boolean {
  return diffOverlay !== undefined
}

/**
 * Watch-store selector body for the inline path.
 *
 * Only yields a diff when the grid is *not* virtualizing: above the threshold
 * the geometry overlay already paints, and a grid-level subscription there
 * would re-render every row on every tick — exactly what splitting
 * `WatchOverlay` out of the grid was meant to avoid. Below the threshold a
 * full re-render is cheap, and the grid re-renders on a tick anyway because
 * `applyWatchResult` replaces `tab.result`.
 *
 * Returns the stored `diff` reference verbatim — never a freshly built object —
 * so Zustand's `Object.is` check keeps unrelated writes (nextTickAt, metrics)
 * from re-rendering the grid.
 */
export function selectInlineWatchDiff(
  state: InlineWatchSource | undefined,
  shouldVirtualize: boolean
): WatchDiff | null {
  if (shouldVirtualize || !state || !state.enabled) return null
  return state.diff
}

/** The keying plan a diff was computed under; rows must be keyed the same way. */
export function inlineDiffPlan(diff: WatchDiff | null | undefined): KeyingPlan | null {
  if (!diff) return null
  return { strategy: diff.keyingStrategy, keyColumns: diff.keyColumns }
}

export interface InlineRowDecoration {
  /** Row key under the diff's plan; null when there is no diff to render. */
  rowKey: string | null
  isAdded: boolean
}

const NO_DECORATION: InlineRowDecoration = { rowKey: null, isAdded: false }

/**
 * Resolve a row's decoration. `rowIndex` must be the row's absolute index in
 * the unpaginated result — the differ keys `row_position` diffs by that index,
 * so a page-local index would shift highlights onto the wrong rows.
 */
export function resolveInlineRowDecoration(
  diff: WatchDiff | null | undefined,
  plan: KeyingPlan | null,
  row: Record<string, unknown>,
  rowIndex: number
): InlineRowDecoration {
  if (!diff || !plan) return NO_DECORATION
  const rowKey = deriveRowKey(row, plan, rowIndex)
  return { rowKey, isAdded: diff.addedRowKeys.has(rowKey) }
}

/**
 * Whether a cell should get the amber changed fill. Added rows are excluded:
 * they already carry a whole-row green band, and stacking amber on top of it
 * reads as noise rather than as two distinct kinds of change.
 *
 * `columnName` is undefined for columns that aren't result fields (the
 * edit-mode action column), which never decorate. An empty string is a real
 * field name — MSSQL returns it for unaliased aggregates — so it is keyed
 * normally.
 */
export function isInlineChangedCell(
  diff: WatchDiff | null | undefined,
  decoration: InlineRowDecoration,
  columnName: string | undefined
): boolean {
  if (!diff || decoration.rowKey === null || decoration.isAdded) return false
  if (columnName === undefined) return false
  return diff.cells.get(cellKey(decoration.rowKey, columnName))?.kind === 'changed'
}
