import { describe, it, expect } from 'vitest'
import { buildGeometry } from '../cell-grid-types'

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
