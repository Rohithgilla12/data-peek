// @vitest-environment jsdom
import * as React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CellSelectionOverlay } from '../cell-selection-overlay'
import { buildGeometry, type CellSelection } from '../cell-grid-types'

describe('CellSelectionOverlay', () => {
  const geometry = buildGeometry([100, 150, 200], 30, 40)

  it('renders nothing when selection is null', () => {
    const { container } = render(
      React.createElement(CellSelectionOverlay, { selection: null, geometry })
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a single rect for a primary range', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 1, col: 0 }, active: { row: 2, col: 1 } },
      additional: []
    }

    const { container } = render(React.createElement(CellSelectionOverlay, { selection, geometry }))

    const rects = container.querySelectorAll('[data-cell-selection-rect]')
    expect(rects).toHaveLength(1)

    const rect = rects[0] as HTMLElement
    // row 1..2: y = 40 (headerHeight) + 1 * 30 = 70px. height = 2 * 30 = 60px.
    // col 0..1: x = 0 (offset[0]). width = offset[1] (100) + width[1] (150) - 0 = 250px.
    expect(rect.style.transform).toBe('translate3d(0px, 70px, 0)')
    expect(rect.style.width).toBe('250px')
    expect(rect.style.height).toBe('60px')
    expect(rect.style.background).toBe('var(--cell-selection-fill)')
    expect(rect.style.pointerEvents).toBe('none')
    expect(rect.style.opacity).toBe('1')
  })

  it('renders multiple rects for primary and additional sparse ranges', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
      additional: [{ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }]
    }

    const { container } = render(React.createElement(CellSelectionOverlay, { selection, geometry }))

    const rects = container.querySelectorAll('[data-cell-selection-rect]')
    expect(rects).toHaveLength(2)

    // Primary: row 0, col 0 -> x = 0, y = 40, w = 100, h = 30
    const primary = rects[0] as HTMLElement
    expect(primary.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(primary.style.width).toBe('100px')
    expect(primary.style.height).toBe('30px')

    // Additional: row 2, col 2 -> x = offset[2] = 250, y = 40 + 2*30 = 100, w = 200, h = 30
    const additional = rects[1] as HTMLElement
    expect(additional.style.transform).toBe('translate3d(250px, 100px, 0)')
    expect(additional.style.width).toBe('200px')
    expect(additional.style.height).toBe('30px')
  })

  it('sets opacity to 0 when suppressed is true', () => {
    const selection: CellSelection = {
      primary: { anchor: { row: 0, col: 0 }, active: { row: 1, col: 1 } },
      additional: []
    }

    const { container } = render(
      React.createElement(CellSelectionOverlay, { selection, geometry, suppressed: true })
    )

    const rect = container.querySelector('[data-cell-selection-rect]') as HTMLElement
    expect(rect).not.toBeNull()
    expect(rect.style.opacity).toBe('0')
  })
})
