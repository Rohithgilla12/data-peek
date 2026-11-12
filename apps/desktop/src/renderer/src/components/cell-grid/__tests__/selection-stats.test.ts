import { describe, expect, it } from 'vitest'
import { computeSelectionStats } from '../selection-stats'
import type { CellPosition, CellSelection, CellSnapshot } from '../cell-grid-types'

function makeGetCell(grid: unknown[][]): (pos: CellPosition) => CellSnapshot {
  return (pos: CellPosition): CellSnapshot => {
    const value = grid[pos.row]?.[pos.col]
    return {
      value,
      columnName: `col_${pos.col}`,
      dataType: typeof value
    }
  }
}

describe('computeSelectionStats', () => {
  it('handles empty selection gracefully', () => {
    const getCell = makeGetCell([])
    const stats = computeSelectionStats(null as unknown as CellSelection, getCell)
    expect(stats).toEqual({
      cellCount: 0,
      numericCount: 0,
      distinctCount: 0,
      nullCount: 0
    })
  })

  it('handles a single cell selection', () => {
    const getCell = makeGetCell([[42]])
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats).toEqual({
      cellCount: 1,
      numericCount: 1,
      sum: 42,
      avg: 42,
      min: 42,
      max: 42,
      distinctCount: 1,
      nullCount: 0
    })
  })

  it('computes sum, avg, min, max for all numeric cells', () => {
    const grid = [
      [10, 20],
      [30, 40]
    ]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(4)
    expect(stats.numericCount).toBe(4)
    expect(stats.sum).toBe(100)
    expect(stats.avg).toBe(25)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(40)
    expect(stats.distinctCount).toBe(4)
    expect(stats.nullCount).toBe(0)
  })

  it('computes stats for mixed types (strings, numbers, nulls, undefined)', () => {
    const grid = [
      ['apple', 10, null],
      [20, 'banana', undefined],
      [30, 'apple', 0]
    ]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 2, col: 2 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(9)
    expect(stats.numericCount).toBe(4) // 10, 20, 30, 0
    expect(stats.sum).toBe(60)
    expect(stats.avg).toBe(15) // 60 / 4
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(30)
    // Non-null values: 'apple', 10, 20, 'banana', 30, 'apple', 0
    // Distinct non-nulls: 'apple', '10', '20', 'banana', '30', '0' -> 6
    expect(stats.distinctCount).toBe(6)
    // Nulls: null at (0,2), undefined at (1,2) -> 2
    expect(stats.nullCount).toBe(2)
  })

  it('handles all-null and undefined cells correctly', () => {
    const grid = [
      [null, undefined],
      [null, null]
    ]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(4)
    expect(stats.nullCount).toBe(4)
    expect(stats.numericCount).toBe(0)
    expect(stats.distinctCount).toBe(0)
    expect(stats.sum).toBeUndefined()
    expect(stats.avg).toBeUndefined()
    expect(stats.min).toBeUndefined()
    expect(stats.max).toBeUndefined()
  })

  it('computes distinct count accurately for duplicate non-null values', () => {
    const grid = [
      ['test', 'test'],
      ['test', 'other']
    ]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(4)
    expect(stats.distinctCount).toBe(2)
    expect(stats.numericCount).toBe(0)
    expect(stats.nullCount).toBe(0)
  })

  it('deduplicates cells across overlapping primary and additional ranges', () => {
    const grid = [
      [10, 20],
      [30, 40]
    ]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } }, // covers all 4 cells
      additional: [
        { anchor: { row: 0, col: 0 }, active: { row: 0, col: 1 } } // overlaps row 0
      ]
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(4)
    expect(stats.numericCount).toBe(4)
    expect(stats.sum).toBe(100)
    expect(stats.avg).toBe(25)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(40)
  })

  it('differentiates distinct values of different types (1 vs "1")', () => {
    const grid = [[1, '1']]
    const getCell = makeGetCell(grid)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 1 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(2)
    expect(stats.distinctCount).toBe(2)
    expect(stats.numericCount).toBe(1)
    expect(stats.sum).toBe(1)
  })

  it('excludes masked cells from sum/avg/min/max to protect privacy and sets hasMasked', () => {
    const getCell = (pos: CellPosition): CellSnapshot => {
      if (pos.col === 0) {
        return { value: 100, columnName: 'ssn', dataType: 'int', isMasked: true }
      }
      return { value: 50, columnName: 'amount', dataType: 'int', isMasked: false }
    }
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 1 } },
      additional: []
    }
    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(2)
    expect(stats.hasMasked).toBe(true)
    // Only the unmasked cell (col 1: 50) is included
    expect(stats.numericCount).toBe(1)
    expect(stats.sum).toBe(50)
    expect(stats.min).toBe(50)
    expect(stats.max).toBe(50)
    expect(stats.distinctCount).toBe(1)
  })
})
