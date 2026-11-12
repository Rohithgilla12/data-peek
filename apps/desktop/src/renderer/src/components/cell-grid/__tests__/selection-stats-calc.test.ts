import { describe, expect, it } from 'vitest'
import { computeSelectionStats } from '../selection-stats'
import type { CellPosition, CellSelection, CellSnapshot } from '../cell-grid-types'

describe('selection-stats calculation edge cases', () => {
  it('handles reverse range where anchor is after active', () => {
    const grid: number[][] = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9]
    ]
    const getCell = (pos: CellPosition): CellSnapshot => ({
      value: grid[pos.row][pos.col],
      columnName: `c${pos.col}`,
      dataType: 'number'
    })

    // Dragging backwards from bottom-right (2,2) to top-left (1,1)
    const selection: CellSelection = {
      primary: { anchor: { row: 2, col: 2 }, active: { row: 1, col: 1 } },
      additional: []
    }

    const stats = computeSelectionStats(selection, getCell)
    // 2x2 cells: (1,1)=5, (1,2)=6, (2,1)=8, (2,2)=9
    expect(stats.cellCount).toBe(4)
    expect(stats.numericCount).toBe(4)
    expect(stats.sum).toBe(28)
    expect(stats.avg).toBe(7)
    expect(stats.min).toBe(5)
    expect(stats.max).toBe(9)
    expect(stats.distinctCount).toBe(4)
    expect(stats.nullCount).toBe(0)
  })

  it('handles negative and floating point values', () => {
    const values = [-10.5, 5.5, -2, 0]
    const getCell = (pos: CellPosition): CellSnapshot => ({
      value: values[pos.col],
      columnName: `c${pos.col}`,
      dataType: 'number'
    })

    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 3 } },
      additional: []
    }

    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(4)
    expect(stats.numericCount).toBe(4)
    expect(stats.sum).toBe(-7)
    expect(stats.avg).toBe(-1.75)
    expect(stats.min).toBe(-10.5)
    expect(stats.max).toBe(5.5)
  })

  it('ignores NaN and Infinity in numeric calculations', () => {
    const values = [10, NaN, Infinity, -Infinity, 20]
    const getCell = (pos: CellPosition): CellSnapshot => ({
      value: values[pos.col],
      columnName: `c${pos.col}`,
      dataType: 'number'
    })

    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 4 } },
      additional: []
    }

    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(5)
    expect(stats.numericCount).toBe(2) // 10 and 20 only
    expect(stats.sum).toBe(30)
    expect(stats.avg).toBe(15)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(20)
    expect(stats.nullCount).toBe(0)
  })

  it('handles multiple disjoint additional ranges', () => {
    const grid: number[][] = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12]
    ]
    const getCell = (pos: CellPosition): CellSnapshot => ({
      value: grid[pos.row][pos.col],
      columnName: `c${pos.col}`,
      dataType: 'number'
    })

    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } }, // value 1
      additional: [
        { anchor: { row: 1, col: 1 }, active: { row: 1, col: 1 } }, // value 6
        { anchor: { row: 2, col: 3 }, active: { row: 2, col: 3 } } // value 12
      ]
    }

    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(3)
    expect(stats.numericCount).toBe(3)
    expect(stats.sum).toBe(19)
    expect(stats.avg).toBe(19 / 3)
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(12)
    expect(stats.distinctCount).toBe(3)
  })

  it('handles objects and JSON stringification in distinct calculation', () => {
    const obj1 = { id: 1, name: 'Alice' }
    const obj2 = { id: 1, name: 'Alice' }
    const obj3 = { id: 2, name: 'Bob' }
    const items = [obj1, obj2, obj3]

    const getCell = (pos: CellPosition): CellSnapshot => ({
      value: items[pos.col],
      columnName: `c${pos.col}`,
      dataType: 'json'
    })

    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 2 } },
      additional: []
    }

    const stats = computeSelectionStats(selection, getCell)
    expect(stats.cellCount).toBe(3)
    expect(stats.distinctCount).toBe(2)
    expect(stats.numericCount).toBe(0)
    expect(stats.nullCount).toBe(0)
  })
})
