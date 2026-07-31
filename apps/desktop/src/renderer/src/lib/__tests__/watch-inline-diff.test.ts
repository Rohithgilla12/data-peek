import { describe, it, expect } from 'vitest'
import type { WatchDiff } from '../watch-types'
import { cellKey } from '../watch-row-keying'
import {
  INLINE_ADDED_ROW_STYLE,
  INLINE_CHANGED_CELL_STYLE,
  inlineDiffPlan,
  isInlineChangedCell,
  isPinnedDiffView,
  resolveInlineRowDecoration,
  selectInlineWatchDiff
} from '../watch-inline-diff'

function makeDiff(overrides: Partial<WatchDiff> = {}): WatchDiff {
  return {
    cells: new Map(),
    addedRowKeys: new Set(),
    removedRowKeys: new Set(),
    keyingStrategy: 'primary_key',
    keyColumns: ['id'],
    computedAt: 1000,
    ...overrides
  }
}

describe('selectInlineWatchDiff', () => {
  it('returns the stored diff reference when the grid is not virtualizing', () => {
    const diff = makeDiff()
    const state = { enabled: true, diff }
    // Referential identity matters: the selector runs on every watch-store
    // write, and Zustand only skips the re-render when Object.is holds.
    expect(selectInlineWatchDiff(state, false)).toBe(diff)
  })

  it('returns null while virtualizing so the geometry overlay stays the only painter', () => {
    const diff = makeDiff()
    expect(selectInlineWatchDiff({ enabled: true, diff }, true)).toBeNull()
  })

  it('returns null when the tab is not being watched', () => {
    const diff = makeDiff()
    expect(selectInlineWatchDiff({ enabled: false, diff }, false)).toBeNull()
    expect(selectInlineWatchDiff(undefined, false)).toBeNull()
  })

  it('returns null when a watched tab has no diff yet (first tick)', () => {
    expect(selectInlineWatchDiff({ enabled: true, diff: null }, false)).toBeNull()
  })
})

describe('isPinnedDiffView', () => {
  it('treats an absent diffOverlay as the live grid', () => {
    expect(isPinnedDiffView(undefined)).toBe(false)
  })

  it('treats an explicit null as a pinned view with nothing to compare', () => {
    // Time Machine viewing a single run passes null, and must not inherit the
    // live watch diff — those highlights describe rows that aren't on screen.
    expect(isPinnedDiffView(null)).toBe(true)
  })

  it('treats a supplied diff as a pinned compare view', () => {
    expect(isPinnedDiffView(makeDiff())).toBe(true)
  })
})

describe('inlineDiffPlan', () => {
  it('mirrors the diff keying strategy and columns', () => {
    const plan = inlineDiffPlan(makeDiff({ keyingStrategy: 'primary_key', keyColumns: ['id'] }))
    expect(plan).toEqual({ strategy: 'primary_key', keyColumns: ['id'] })
  })

  it('is null without a diff', () => {
    expect(inlineDiffPlan(null)).toBeNull()
    expect(inlineDiffPlan(undefined)).toBeNull()
  })
})

describe('resolveInlineRowDecoration', () => {
  it('keys the row under the diff plan', () => {
    const diff = makeDiff()
    const plan = inlineDiffPlan(diff)
    const decoration = resolveInlineRowDecoration(diff, plan, { id: 42, name: 'a' }, 3)
    expect(decoration.rowKey).toBe('42')
    expect(decoration.isAdded).toBe(false)
  })

  it('keys by position when the diff keyed by position', () => {
    const diff = makeDiff({ keyingStrategy: 'row_position', keyColumns: [] })
    const plan = inlineDiffPlan(diff)
    const decoration = resolveInlineRowDecoration(diff, plan, { id: 42 }, 3)
    expect(decoration.rowKey).toBe('#3')
  })

  it('flags rows present in addedRowKeys', () => {
    const diff = makeDiff({ addedRowKeys: new Set(['42']) })
    const decoration = resolveInlineRowDecoration(diff, inlineDiffPlan(diff), { id: 42 }, 0)
    expect(decoration.isAdded).toBe(true)
  })

  it('decorates nothing without a diff', () => {
    const decoration = resolveInlineRowDecoration(null, null, { id: 42 }, 0)
    expect(decoration.rowKey).toBeNull()
    expect(decoration.isAdded).toBe(false)
  })
})

describe('isInlineChangedCell', () => {
  const changedDiff = makeDiff({
    cells: new Map([[cellKey('42', 'name'), { kind: 'changed' as const, changedAt: 1000 }]])
  })

  it('highlights a cell the differ marked changed', () => {
    const decoration = resolveInlineRowDecoration(
      changedDiff,
      inlineDiffPlan(changedDiff),
      { id: 42 },
      0
    )
    expect(isInlineChangedCell(changedDiff, decoration, 'name')).toBe(true)
  })

  it('leaves other columns of the same row alone', () => {
    const decoration = resolveInlineRowDecoration(
      changedDiff,
      inlineDiffPlan(changedDiff),
      { id: 42 },
      0
    )
    expect(isInlineChangedCell(changedDiff, decoration, 'email')).toBe(false)
  })

  it('leaves the same column of another row alone', () => {
    const decoration = resolveInlineRowDecoration(
      changedDiff,
      inlineDiffPlan(changedDiff),
      { id: 43 },
      1
    )
    expect(isInlineChangedCell(changedDiff, decoration, 'name')).toBe(false)
  })

  it('suppresses per-cell amber on an added row, which already has a green band', () => {
    const diff = makeDiff({
      addedRowKeys: new Set(['42']),
      cells: new Map([[cellKey('42', 'name'), { kind: 'changed' as const, changedAt: 1000 }]])
    })
    const decoration = resolveInlineRowDecoration(diff, inlineDiffPlan(diff), { id: 42 }, 0)
    expect(decoration.isAdded).toBe(true)
    expect(isInlineChangedCell(diff, decoration, 'name')).toBe(false)
  })

  it('ignores non-changed cell kinds', () => {
    const diff = makeDiff({
      cells: new Map([[cellKey('42', 'name'), { kind: 'unchanged' as const, changedAt: 1000 }]])
    })
    const decoration = resolveInlineRowDecoration(diff, inlineDiffPlan(diff), { id: 42 }, 0)
    expect(isInlineChangedCell(diff, decoration, 'name')).toBe(false)
  })

  it('returns false for a column with no name, e.g. the edit-mode action column', () => {
    const decoration = resolveInlineRowDecoration(
      changedDiff,
      inlineDiffPlan(changedDiff),
      { id: 42 },
      0
    )
    expect(isInlineChangedCell(changedDiff, decoration, undefined)).toBe(false)
  })

  it('still keys an empty column name, which the differ treats as a real field', () => {
    const diff = makeDiff({
      cells: new Map([[cellKey('42', ''), { kind: 'changed' as const, changedAt: 1000 }]])
    })
    const decoration = resolveInlineRowDecoration(diff, inlineDiffPlan(diff), { id: 42 }, 0)
    expect(isInlineChangedCell(diff, decoration, '')).toBe(true)
  })

  it('returns false without a diff', () => {
    expect(isInlineChangedCell(null, { rowKey: null, isAdded: false }, 'name')).toBe(false)
  })
})

describe('inline decoration styles', () => {
  it('reuse the same custom properties the geometry overlay paints', () => {
    // The capture spec (tests/capture/watch-mode.capture.ts) asserts on
    // `[style*="--cell-diff-fill"]`, so these strings are load-bearing.
    expect(INLINE_CHANGED_CELL_STYLE.backgroundColor).toBe('var(--cell-diff-fill)')
    expect(INLINE_ADDED_ROW_STYLE.backgroundColor).toBe('var(--cell-diff-added)')
  })
})
