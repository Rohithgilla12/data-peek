import { describe, it, expect } from 'vitest'
import {
  buildGeometry,
  rangeBounds,
  containsCell,
  selectionContains,
  iterateSelection,
  type CellRange,
  type CellSelection
} from '../cell-grid-types'

describe('buildGeometry', () => {
  it('returns the input rowHeight and headerHeight verbatim', () => {
    const geom = buildGeometry([120, 80, 200], 37, 40)
    expect(geom.rowHeight).toBe(37)
    expect(geom.headerHeight).toBe(40)
  })

  it('preserves columnWidths', () => {
    const widths = [120, 80, 200]
    const geom = buildGeometry(widths, 37, 40)
    expect(geom.columnWidths).toEqual(widths)
  })

  it('computes columnOffsets as a prefix sum', () => {
    const geom = buildGeometry([120, 80, 200, 50], 37, 40)
    expect(geom.columnOffsets).toEqual([0, 120, 200, 400])
  })

  it('produces a totalWidth equal to the sum of columnWidths', () => {
    const geom = buildGeometry([120, 80, 200, 50], 37, 40)
    expect(geom.totalWidth).toBe(450)
  })

  it('keeps columnOffsets and columnWidths the same length', () => {
    const widths = [10, 20, 30, 40, 50, 60]
    const geom = buildGeometry(widths, 37, 40)
    expect(geom.columnOffsets).toHaveLength(widths.length)
  })

  it('returns 0 totalWidth and empty arrays for no columns', () => {
    const geom = buildGeometry([], 37, 40)
    expect(geom.columnOffsets).toEqual([])
    expect(geom.totalWidth).toBe(0)
  })

  it('handles a single column', () => {
    const geom = buildGeometry([150], 37, 40)
    expect(geom.columnOffsets).toEqual([0])
    expect(geom.totalWidth).toBe(150)
  })

  it('handles zero-width columns without producing NaN', () => {
    const geom = buildGeometry([0, 100, 0, 50], 37, 40)
    expect(geom.columnOffsets).toEqual([0, 0, 100, 100])
    expect(geom.totalWidth).toBe(150)
    expect(Number.isNaN(geom.totalWidth)).toBe(false)
  })

  it('positions every column at its prefix-summed offset', () => {
    const widths = [100, 75, 200, 125]
    const geom = buildGeometry(widths, 37, 40)
    // Invariant: offsets[i] === sum(widths[0..i-1])
    for (let i = 0; i < widths.length; i++) {
      const expected = widths.slice(0, i).reduce((s, w) => s + w, 0)
      expect(geom.columnOffsets[i]).toBe(expected)
    }
  })

  it('the last offset plus the last width equals totalWidth', () => {
    const widths = [120, 80, 200]
    const geom = buildGeometry(widths, 37, 40)
    const lastOffset = geom.columnOffsets[geom.columnOffsets.length - 1]
    const lastWidth = widths[widths.length - 1]
    expect(lastOffset + lastWidth).toBe(geom.totalWidth)
  })
})

describe('rangeBounds', () => {
  it('normalizes single-cell range where anchor equals active', () => {
    const range: CellRange = { anchor: { row: 3, col: 4 }, active: { row: 3, col: 4 } }
    expect(rangeBounds(range)).toEqual({ r1: 3, c1: 4, r2: 3, c2: 4 })
  })

  it('preserves order when anchor is top-left and active is bottom-right', () => {
    const range: CellRange = { anchor: { row: 1, col: 2 }, active: { row: 5, col: 8 } }
    expect(rangeBounds(range)).toEqual({ r1: 1, c1: 2, r2: 5, c2: 8 })
  })

  it('normalizes when anchor is bottom-right and active is top-left', () => {
    const range: CellRange = { anchor: { row: 5, col: 8 }, active: { row: 1, col: 2 } }
    expect(rangeBounds(range)).toEqual({ r1: 1, c1: 2, r2: 5, c2: 8 })
  })

  it('normalizes when only row is inverted', () => {
    const range: CellRange = { anchor: { row: 10, col: 2 }, active: { row: 4, col: 7 } }
    expect(rangeBounds(range)).toEqual({ r1: 4, c1: 2, r2: 10, c2: 7 })
  })

  it('normalizes when only col is inverted', () => {
    const range: CellRange = { anchor: { row: 2, col: 9 }, active: { row: 6, col: 1 } }
    expect(rangeBounds(range)).toEqual({ r1: 2, c1: 1, r2: 6, c2: 9 })
  })
})

describe('containsCell', () => {
  const range: CellRange = { anchor: { row: 2, col: 3 }, active: { row: 5, col: 7 } }

  it('returns true for inner cells', () => {
    expect(containsCell(range, { row: 3, col: 4 })).toBe(true)
    expect(containsCell(range, { row: 4, col: 6 })).toBe(true)
  })

  it('returns true for all four boundary corners', () => {
    expect(containsCell(range, { row: 2, col: 3 })).toBe(true)
    expect(containsCell(range, { row: 2, col: 7 })).toBe(true)
    expect(containsCell(range, { row: 5, col: 3 })).toBe(true)
    expect(containsCell(range, { row: 5, col: 7 })).toBe(true)
  })

  it('returns false for cells strictly outside row bounds', () => {
    expect(containsCell(range, { row: 1, col: 5 })).toBe(false)
    expect(containsCell(range, { row: 6, col: 5 })).toBe(false)
  })

  it('returns false for cells strictly outside column bounds', () => {
    expect(containsCell(range, { row: 3, col: 2 })).toBe(false)
    expect(containsCell(range, { row: 3, col: 8 })).toBe(false)
  })

  it('works correctly with an inverted range', () => {
    const inverted: CellRange = { anchor: { row: 5, col: 7 }, active: { row: 2, col: 3 } }
    expect(containsCell(inverted, { row: 3, col: 4 })).toBe(true)
    expect(containsCell(inverted, { row: 2, col: 3 })).toBe(true)
    expect(containsCell(inverted, { row: 1, col: 3 })).toBe(false)
    expect(containsCell(inverted, { row: 3, col: 8 })).toBe(false)
  })

  it('correctly tests single-cell range', () => {
    const single: CellRange = { anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }
    expect(containsCell(single, { row: 2, col: 2 })).toBe(true)
    expect(containsCell(single, { row: 2, col: 3 })).toBe(false)
    expect(containsCell(single, { row: 3, col: 2 })).toBe(false)
  })
})

describe('selectionContains', () => {
  const selection: CellSelection = {
    primary: { anchor: { row: 1, col: 1 }, active: { row: 3, col: 3 } },
    additional: [
      { anchor: { row: 6, col: 6 }, active: { row: 6, col: 6 } },
      { anchor: { row: 8, col: 2 }, active: { row: 9, col: 4 } }
    ]
  }

  it('returns true for cell in primary range', () => {
    expect(selectionContains(selection, { row: 2, col: 2 })).toBe(true)
    expect(selectionContains(selection, { row: 1, col: 1 })).toBe(true)
    expect(selectionContains(selection, { row: 3, col: 3 })).toBe(true)
  })

  it('returns true for cell in an additional range', () => {
    expect(selectionContains(selection, { row: 6, col: 6 })).toBe(true)
    expect(selectionContains(selection, { row: 8, col: 3 })).toBe(true)
    expect(selectionContains(selection, { row: 9, col: 4 })).toBe(true)
  })

  it('returns false for cell outside all ranges', () => {
    expect(selectionContains(selection, { row: 0, col: 0 })).toBe(false)
    expect(selectionContains(selection, { row: 4, col: 4 })).toBe(false)
    expect(selectionContains(selection, { row: 7, col: 6 })).toBe(false)
  })

  it('works when additional is empty', () => {
    const singleRangeSelection: CellSelection = {
      primary: { anchor: { row: 2, col: 2 }, active: { row: 4, col: 4 } },
      additional: []
    }
    expect(selectionContains(singleRangeSelection, { row: 3, col: 3 })).toBe(true)
    expect(selectionContains(singleRangeSelection, { row: 5, col: 5 })).toBe(false)
  })
})

describe('iterateSelection', () => {
  it('yields a single cell for single-cell selection', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 2, col: 3 }, active: { row: 2, col: 3 } },
      additional: []
    }
    const cells = [...iterateSelection(selection)]
    expect(cells).toEqual([{ row: 2, col: 3 }])
  })

  it('yields all cells in row-major order for primary range', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 1, col: 2 }, active: { row: 2, col: 4 } },
      additional: []
    }
    const cells = [...iterateSelection(selection)]
    expect(cells).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 }
    ])
  })

  it('yields correctly when primary range is inverted', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 2, col: 3 }, active: { row: 1, col: 2 } },
      additional: []
    }
    const cells = [...iterateSelection(selection)]
    expect(cells).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 2 },
      { row: 2, col: 3 }
    ])
  })

  it('yields primary range cells followed by additional range cells', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 1 } },
      additional: [{ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }]
    }
    const cells = [...iterateSelection(selection)]
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 2, col: 2 }
    ])
  })
})
