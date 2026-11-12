// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCellSelection } from '../use-cell-selection'
import type { CellPosition } from '../cell-grid-types'

describe('useCellSelection', () => {
  beforeAll(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true
    })
    if (typeof globalThis.HTMLInputElement === 'undefined') {
      globalThis.HTMLInputElement = window.HTMLInputElement
    }
    if (typeof globalThis.HTMLTextAreaElement === 'undefined') {
      globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement
    }
    if (typeof globalThis.HTMLSelectElement === 'undefined') {
      globalThis.HTMLSelectElement = window.HTMLSelectElement
    }
  })
  const defaultOptions = {
    rowCount: 10,
    colCount: 5,
    enabled: true,
    focus: { row: 0, col: 0 } as CellPosition | null,
    setFocus: vi.fn()
  }

  it('initializes with null selection', () => {
    const { result } = renderHook(() => useCellSelection(defaultOptions))
    expect(result.current.selection).toBeNull()
  })

  describe('extendTo', () => {
    it('creates primary range from focus anchor to target position', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 1, col: 1 } })
      )

      act(() => {
        result.current.extendTo({ row: 3, col: 4 })
      })

      expect(result.current.selection).toEqual({
        primary: {
          anchor: { row: 1, col: 1 },
          active: { row: 3, col: 4 }
        },
        additional: []
      })
    })

    it('updates active position while preserving anchor on subsequent calls', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 0, col: 0 } })
      )

      act(() => {
        result.current.extendTo({ row: 2, col: 2 })
      })
      expect(result.current.selection?.primary.active).toEqual({ row: 2, col: 2 })

      act(() => {
        result.current.extendTo({ row: 5, col: 1 })
      })
      expect(result.current.selection?.primary.anchor).toEqual({ row: 0, col: 0 })
      expect(result.current.selection?.primary.active).toEqual({ row: 5, col: 1 })
    })

    it('clamps target position to grid bounds', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, rowCount: 10, colCount: 5 })
      )

      act(() => {
        result.current.extendTo({ row: 20, col: 10 })
      })

      expect(result.current.selection?.primary.active).toEqual({ row: 9, col: 4 })
    })

    it('initializes focus when focus is null', () => {
      const setFocus = vi.fn()
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: null, setFocus })
      )

      act(() => {
        result.current.extendTo({ row: 2, col: 3 })
      })

      expect(setFocus).toHaveBeenCalledWith({ row: 2, col: 3 })
      expect(result.current.selection?.primary.active).toEqual({ row: 2, col: 3 })
    })
  })

  describe('toggleSparse', () => {
    it('adds sparse cell as additional range when focus exists', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 0, col: 0 } })
      )

      act(() => {
        result.current.toggleSparse({ row: 2, col: 2 })
      })

      expect(result.current.selection).toEqual({
        primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 0 } },
        additional: [{ anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } }]
      })
    })

    it('toggles off an already selected additional sparse cell', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 0, col: 0 } })
      )

      act(() => {
        result.current.toggleSparse({ row: 2, col: 2 })
      })
      expect(result.current.selection?.additional).toHaveLength(1)

      // Toggle again on same cell
      act(() => {
        result.current.toggleSparse({ row: 2, col: 2 })
      })
      expect(result.current.selection?.additional).toHaveLength(0)
    })

    it('allows selecting multiple sparse cells', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 0, col: 0 } })
      )

      act(() => {
        result.current.toggleSparse({ row: 1, col: 1 })
      })
      act(() => {
        result.current.toggleSparse({ row: 3, col: 3 })
      })

      expect(result.current.selection?.additional).toEqual([
        { anchor: { row: 1, col: 1 }, active: { row: 1, col: 1 } },
        { anchor: { row: 3, col: 3 }, active: { row: 3, col: 3 } }
      ])
    })
  })

  describe('clear', () => {
    it('clears active selection to null', () => {
      const { result } = renderHook(() => useCellSelection(defaultOptions))

      act(() => {
        result.current.extendTo({ row: 2, col: 2 })
      })
      expect(result.current.selection).not.toBeNull()

      act(() => {
        result.current.clear()
      })
      expect(result.current.selection).toBeNull()
    })
  })

  describe('focus change reaction', () => {
    it('collapses selection when focus changes (e.g. plain arrow navigation)', () => {
      let focus: CellPosition | null = { row: 0, col: 0 }
      const { result, rerender } = renderHook(() => useCellSelection({ ...defaultOptions, focus }))

      act(() => {
        result.current.extendTo({ row: 2, col: 2 })
      })
      expect(result.current.selection).not.toBeNull()

      // Simulate plain navigation changing focus
      focus = { row: 1, col: 0 }
      rerender()

      expect(result.current.selection).toBeNull()
    })
  })

  describe('grid bounds reaction', () => {
    it('clamps selection when rowCount shrinks', () => {
      let rowCount = 10
      const { result, rerender } = renderHook(() =>
        useCellSelection({ ...defaultOptions, rowCount })
      )

      act(() => {
        result.current.extendTo({ row: 8, col: 2 })
      })
      expect(result.current.selection?.primary.active.row).toBe(8)

      // Shrink rowCount to 5
      rowCount = 5
      rerender()

      expect(result.current.selection?.primary.active.row).toBe(4)
    })

    it('clears selection when grid becomes empty', () => {
      let rowCount = 10
      const { result, rerender } = renderHook(() =>
        useCellSelection({ ...defaultOptions, rowCount })
      )

      act(() => {
        result.current.extendTo({ row: 2, col: 2 })
      })
      expect(result.current.selection).not.toBeNull()

      rowCount = 0
      rerender()

      expect(result.current.selection).toBeNull()
    })
  })

  describe('keyboard navigation via hotkeys', () => {
    it('extends selection with Shift+ArrowDown and Shift+ArrowRight', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 0, col: 0 } })
      )

      // Fire Shift+ArrowDown
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 1, col: 0 }
      })

      // Fire Shift+ArrowRight
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            code: 'ArrowRight',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 1, col: 1 }
      })
    })

    it('extends selection with Shift+End and Shift+Home', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 1, col: 1 }, colCount: 5 })
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'End', code: 'End', shiftKey: true, bubbles: true })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 1, col: 1 },
        active: { row: 1, col: 4 }
      })

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Home', code: 'Home', shiftKey: true, bubbles: true })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 1, col: 1 },
        active: { row: 1, col: 0 }
      })
    })

    it('selects all with Mod+A', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, rowCount: 10, colCount: 5 })
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', metaKey: true, bubbles: true })
        )
      })

      expect(result.current.selection).toEqual({
        primary: {
          anchor: { row: 0, col: 0 },
          active: { row: 9, col: 4 }
        },
        additional: []
      })
    })

    it('clears selection on Escape', () => {
      const { result } = renderHook(() => useCellSelection(defaultOptions))

      act(() => {
        result.current.extendTo({ row: 3, col: 3 })
      })
      expect(result.current.selection).not.toBeNull()

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
        )
      })

      expect(result.current.selection).toBeNull()
    })

    it('extends selection with Shift+ArrowUp and Shift+ArrowLeft', () => {
      const { result } = renderHook(() =>
        useCellSelection({ ...defaultOptions, focus: { row: 3, col: 3 } })
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowUp',
            code: 'ArrowUp',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 3, col: 3 },
        active: { row: 2, col: 3 }
      })

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowLeft',
            code: 'ArrowLeft',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 3, col: 3 },
        active: { row: 2, col: 2 }
      })
    })

    it('extends selection with Shift+Mod+Home and Shift+Mod+End', () => {
      const { result } = renderHook(() =>
        useCellSelection({
          ...defaultOptions,
          focus: { row: 5, col: 2 },
          rowCount: 10,
          colCount: 5
        })
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Home',
            code: 'Home',
            shiftKey: true,
            metaKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 5, col: 2 },
        active: { row: 0, col: 0 }
      })

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'End',
            code: 'End',
            shiftKey: true,
            metaKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 5, col: 2 },
        active: { row: 9, col: 4 }
      })
    })

    it('extends selection with Shift+PageDown and Shift+PageUp', () => {
      const { result } = renderHook(() =>
        useCellSelection({
          ...defaultOptions,
          focus: { row: 0, col: 0 },
          rowCount: 100,
          colCount: 10
        })
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'PageDown',
            code: 'PageDown',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 20, col: 0 }
      })

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'PageUp',
            code: 'PageUp',
            shiftKey: true,
            bubbles: true
          })
        )
      })

      expect(result.current.selection?.primary).toEqual({
        anchor: { row: 0, col: 0 },
        active: { row: 0, col: 0 }
      })
    })

    it('allows manually replacing selection via setSelection', () => {
      const { result } = renderHook(() => useCellSelection(defaultOptions))

      const customSelection = {
        primary: { anchor: { row: 1, col: 0 }, active: { row: 1, col: 4 } },
        additional: []
      }

      act(() => {
        result.current.setSelection(customSelection)
      })

      expect(result.current.selection).toEqual(customSelection)
    })
  })
})
