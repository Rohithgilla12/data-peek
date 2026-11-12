import { describe, it, expect } from 'vitest'
import { computeSelectionRects } from '../cell-selection-overlay'
import { buildGeometry, type CellSelection } from '../cell-grid-types'

describe('computeSelectionRects', () => {
  const geometry = buildGeometry([100, 150, 200], 30, 40)

  it('returns empty array when selection is null', () => {
    expect(computeSelectionRects(null, geometry)).toEqual([])
  })

  it('computes a single rect for a primary range', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 1, col: 0 }, active: { row: 2, col: 1 } },
      additional: []
    }

    const rects = computeSelectionRects(selection, geometry)
    expect(rects).toHaveLength(1)

    const [rect] = rects
    // row 1..2: y = 40 (headerHeight) + 1 * 30 = 70px. height = (2 - 1 + 1) * 30 = 60px.
    // col 0..1: x = 0 (offset[0]). width = offset[1] (100) + width[1] (150) - 0 = 250px.
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(70)
    expect(rect.width).toBe(250)
    expect(rect.height).toBe(60)
    expect(rect.key).toBe('primary')
  })

  it('computes multiple rects for primary and additional sparse ranges', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
      additional: [{ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }]
    }

    const rects = computeSelectionRects(selection, geometry)
    expect(rects).toHaveLength(2)

    // Primary: row 0, col 0 -> x = 0, y = 40, w = 100, h = 30
    const [primary, additional] = rects
    expect(primary.x).toBe(0)
    expect(primary.y).toBe(40)
    expect(primary.width).toBe(100)
    expect(primary.height).toBe(30)
    expect(primary.key).toBe('primary')

    // Additional: row 2, col 2 -> x = offset[2] = 250, y = 40 + 2*30 = 100, w = 200, h = 30
    expect(additional.x).toBe(250)
    expect(additional.y).toBe(100)
    expect(additional.width).toBe(200)
    expect(additional.height).toBe(30)
    expect(additional.key).toBe('additional-1-2-2-2-2')
  })

  it('ignores zero-size rects', () => {
    const zeroGeometry = buildGeometry([0, 0], 0, 0)
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
      additional: []
    }

    expect(computeSelectionRects(selection, zeroGeometry)).toEqual([])
  })
})
