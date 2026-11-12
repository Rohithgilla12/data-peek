import { describe, it, expect } from 'vitest'
import {
  clampPos,
  clampRange,
  clampSelectionBounds,
  extendSelectionRange,
  toggleSparseCell,
  extendSelectionByDelta,
  extendSelectionToCol,
  extendSelectionToBoundary,
  selectAllCells,
  samePosition,
  PAGE_STEP
} from '../use-cell-selection'
import type { CellSelection } from '../cell-grid-types'

describe('use-cell-selection pure logic', () => {
  const rowCount = 10
  const colCount = 5

  describe('samePosition', () => {
    it('compares positions correctly', () => {
      expect(samePosition(null, null)).toBe(true)
      expect(samePosition({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true)
      expect(samePosition({ row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false)
      expect(samePosition({ row: 1, col: 2 }, null)).toBe(false)
      expect(samePosition(null, { row: 1, col: 2 })).toBe(false)
    })
  })

  describe('clampPos and clampRange', () => {
    it('clamps cell position within grid boundaries', () => {
      expect(clampPos({ row: -5, col: -2 }, 10, 5)).toEqual({ row: 0, col: 0 })
      expect(clampPos({ row: 20, col: 10 }, 10, 5)).toEqual({ row: 9, col: 4 })
      expect(clampPos({ row: 3, col: 2 }, 10, 5)).toEqual({ row: 3, col: 2 })
    })

    it('clamps range within bounds', () => {
      const range = {
        anchor: { row: -1, col: 0 },
        active: { row: 20, col: 20 }
      }
      expect(clampRange(range, 10, 5)).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 9, col: 4 }
      })
    })
  })

  describe('clampSelectionBounds', () => {
    it('returns null when selection is null or grid is empty', () => {
      expect(clampSelectionBounds(null, 10, 5)).toBeNull()
      const sel: CellSelection = {
        primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } },
        additional: []
      }
      expect(clampSelectionBounds(sel, 0, 5)).toBeNull()
      expect(clampSelectionBounds(sel, 10, 0)).toBeNull()
    })

    it('clamps primary and additional ranges when rowCount shrinks', () => {
      const sel: CellSelection = {
        primary: { anchor: { row: 0, col: 0 }, active: { row: 8, col: 2 } },
        additional: [{ anchor: { row: 7, col: 1 }, active: { row: 9, col: 4 } }]
      }
      const clamped = clampSelectionBounds(sel, 5, 3)
      expect(clamped).toEqual({
        primary: { anchor: { row: 0, col: 0 }, active: { row: 4, col: 2 } },
        additional: [{ anchor: { row: 4, col: 1 }, active: { row: 4, col: 2 } }]
      })
    })
  })

  describe('extendSelectionRange', () => {
    it('creates primary range from anchor fallback when current is null', () => {
      const sel = extendSelectionRange(
        null,
        { row: 3, col: 4 },
        { row: 1, col: 1 },
        rowCount,
        colCount
      )
      expect(sel).toEqual({
        primary: {
          anchor: { row: 1, col: 1 },
          active: { row: 3, col: 4 }
        },
        additional: []
      })
    })

    it('updates active position while preserving anchor when selection already exists', () => {
      const initial = extendSelectionRange(
        null,
        { row: 2, col: 2 },
        { row: 0, col: 0 },
        rowCount,
        colCount
      )
      const next = extendSelectionRange(
        initial,
        { row: 5, col: 1 },
        { row: 0, col: 0 },
        rowCount,
        colCount
      )
      expect(next?.primary.anchor).toEqual({ row: 0, col: 0 })
      expect(next?.primary.active).toEqual({ row: 5, col: 1 })
    })

    it('clamps target position to grid bounds', () => {
      const sel = extendSelectionRange(null, { row: 25, col: 15 }, { row: 0, col: 0 }, 10, 5)
      expect(sel?.primary.active).toEqual({ row: 9, col: 4 })
    })

    it('returns null if grid is empty', () => {
      expect(extendSelectionRange(null, { row: 1, col: 1 }, { row: 0, col: 0 }, 0, 5)).toBeNull()
    })
  })

  describe('toggleSparseCell', () => {
    it('initializes primary and additional when focus differs from target cell', () => {
      const sel = toggleSparseCell(null, { row: 2, col: 2 }, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel).toEqual({
        primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
        additional: [{ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }]
      })
    })

    it('initializes single primary range when focus matches target cell or is null', () => {
      const sel = toggleSparseCell(null, { row: 0, col: 0 }, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel).toEqual({
        primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
        additional: []
      })
    })

    it('adds subsequent sparse cells into additional ranges', () => {
      let sel = toggleSparseCell(null, { row: 1, col: 1 }, { row: 0, col: 0 }, rowCount, colCount)
      sel = toggleSparseCell(sel, { row: 3, col: 3 }, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel?.additional).toEqual([
        { anchor: { row: 1, col: 1 }, active: { row: 1, col: 1 } },
        { anchor: { row: 3, col: 3 }, active: { row: 3, col: 3 } }
      ])
    })

    it('toggles off an already selected additional sparse cell', () => {
      let sel = toggleSparseCell(null, { row: 2, col: 2 }, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel?.additional).toHaveLength(1)

      sel = toggleSparseCell(sel, { row: 2, col: 2 }, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel?.additional).toHaveLength(0)
    })

    it('promotes an additional cell to primary when primary single-cell is toggled off', () => {
      let sel = toggleSparseCell(null, { row: 2, col: 2 }, { row: 0, col: 0 }, rowCount, colCount)
      // primary is (0,0), additional is [(2,2)]
      expect(sel?.primary.anchor).toEqual({ row: 0, col: 0 })

      // Toggle off (0,0)
      sel = toggleSparseCell(sel, { row: 0, col: 0 }, null, rowCount, colCount)
      expect(sel?.primary).toEqual({ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } })
      expect(sel?.additional).toHaveLength(0)
    })

    it('returns null when primary is the only cell and is toggled off', () => {
      const sel = toggleSparseCell(null, { row: 1, col: 1 }, null, rowCount, colCount)
      const toggledOff = toggleSparseCell(sel, { row: 1, col: 1 }, null, rowCount, colCount)
      expect(toggledOff).toBeNull()
    })
  })

  describe('extendSelectionByDelta', () => {
    it('extends primary range active by delta', () => {
      const sel = extendSelectionByDelta(null, 1, 0, { row: 0, col: 0 }, rowCount, colCount)
      expect(sel?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 1, col: 0 }
      })

      const right = extendSelectionByDelta(sel, 0, 2, { row: 0, col: 0 }, rowCount, colCount)
      expect(right?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 1, col: 2 }
      })
    })

    it('handles negative deltas and clamps to 0', () => {
      const sel = extendSelectionByDelta(null, -5, -5, { row: 2, col: 2 }, rowCount, colCount)
      expect(sel?.primary).toEqual({
        anchor: { row: 2, col: 2 },
        active: { row: 0, col: 0 }
      })
    })

    it('supports page down and page up using PAGE_STEP', () => {
      const paged = extendSelectionByDelta(null, PAGE_STEP, 0, { row: 0, col: 0 }, 100, 10)
      expect(paged?.primary.active.row).toBe(PAGE_STEP)

      const pagedBack = extendSelectionByDelta(paged, -PAGE_STEP, 0, { row: 0, col: 0 }, 100, 10)
      expect(pagedBack?.primary.active.row).toBe(0)
    })
  })

  describe('extendSelectionToCol and extendSelectionToBoundary', () => {
    it('extends selection to target col', () => {
      const sel = extendSelectionToCol(null, 4, { row: 1, col: 1 }, rowCount, colCount)
      expect(sel?.primary).toEqual({
        anchor: { row: 1, col: 1 },
        active: { row: 1, col: 4 }
      })

      const home = extendSelectionToCol(sel, 0, { row: 1, col: 1 }, rowCount, colCount)
      expect(home?.primary).toEqual({
        anchor: { row: 1, col: 1 },
        active: { row: 1, col: 0 }
      })
    })

    it('extends selection to boundary corners (Mod+Home / Mod+End)', () => {
      const topStart = extendSelectionToBoundary(null, 0, 0, { row: 5, col: 2 }, rowCount, colCount)
      expect(topStart?.primary).toEqual({
        anchor: { row: 5, col: 2 },
        active: { row: 0, col: 0 }
      })

      const bottomEnd = extendSelectionToBoundary(
        null,
        rowCount - 1,
        colCount - 1,
        { row: 5, col: 2 },
        rowCount,
        colCount
      )
      expect(bottomEnd?.primary).toEqual({
        anchor: { row: 5, col: 2 },
        active: { row: 9, col: 4 }
      })
    })
  })

  describe('selectAllCells', () => {
    it('creates a range spanning the entire grid', () => {
      const all = selectAllCells(10, 5)
      expect(all).toEqual({
        primary: {
          anchor: { row: 0, col: 0 },
          active: { row: 9, col: 4 }
        },
        additional: []
      })
    })

    it('returns null if rowCount or colCount is 0', () => {
      expect(selectAllCells(0, 5)).toBeNull()
      expect(selectAllCells(10, 0)).toBeNull()
    })
  })
})
