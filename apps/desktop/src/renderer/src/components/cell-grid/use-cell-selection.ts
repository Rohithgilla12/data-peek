import * as React from 'react'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import type { CellPosition, CellSelection, CellRange } from './cell-grid-types'

function samePosition(a: CellPosition | null, b: CellPosition | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.row === b.row && a.col === b.col
}

const PAGE_STEP = 20

export interface UseCellSelectionOptions {
  rowCount: number
  colCount: number
  enabled?: boolean
  target?: React.RefObject<HTMLElement | null>
  focus: CellPosition | null
  setFocus: (next: CellPosition | null) => void
}

export interface UseCellSelectionResult {
  selection: CellSelection | null
  setSelection: (next: CellSelection | null) => void
  extendTo: (pos: CellPosition) => void
  toggleSparse: (pos: CellPosition) => void
  clear: () => void
}

export function useCellSelection({
  rowCount,
  colCount,
  enabled = true,
  target,
  focus,
  setFocus
}: UseCellSelectionOptions): UseCellSelectionResult {
  const [selection, setSelection] = React.useState<CellSelection | null>(null)

  const focusRef = React.useRef(focus)
  focusRef.current = focus

  const selectionRef = React.useRef(selection)
  selectionRef.current = selection

  // Collapse selection when focus moves via plain navigation / mouse click
  const prevFocusRef = React.useRef(focus)
  React.useEffect(() => {
    if (!samePosition(prevFocusRef.current, focus)) {
      prevFocusRef.current = focus
      setSelection(null)
    }
  }, [focus])

  // Clamp selection bounds if rowCount / colCount shrink; clear if grid is empty
  const hasData = rowCount > 0 && colCount > 0
  React.useEffect(() => {
    if (!enabled) return
    if (!hasData) {
      setSelection(null)
      return
    }

    setSelection((cur) => {
      if (!cur) return null
      const clampPos = (p: CellPosition): CellPosition => ({
        row: Math.max(0, Math.min(rowCount - 1, p.row)),
        col: Math.max(0, Math.min(colCount - 1, p.col))
      })
      const clampRange = (r: CellRange): CellRange => ({
        anchor: clampPos(r.anchor),
        active: clampPos(r.active)
      })

      const nextPrimary = clampRange(cur.primary)
      const nextAdditional = cur.additional.map(clampRange)

      return { primary: nextPrimary, additional: nextAdditional }
    })
  }, [enabled, hasData, rowCount, colCount])

  const clear = React.useCallback(() => {
    setSelection(null)
  }, [])

  const extendTo = React.useCallback(
    (pos: CellPosition) => {
      if (rowCount <= 0 || colCount <= 0) return
      const clamped: CellPosition = {
        row: Math.max(0, Math.min(rowCount - 1, pos.row)),
        col: Math.max(0, Math.min(colCount - 1, pos.col))
      }

      setSelection((cur) => {
        if (cur) {
          return {
            primary: { anchor: cur.primary.anchor, active: clamped },
            additional: cur.additional
          }
        }
        const anchor = focusRef.current ?? clamped
        if (!focusRef.current) {
          prevFocusRef.current = anchor
          setFocus(anchor)
        }
        return {
          primary: { anchor, active: clamped },
          additional: []
        }
      })
    },
    [rowCount, colCount, setFocus]
  )

  const toggleSparse = React.useCallback(
    (pos: CellPosition) => {
      if (rowCount <= 0 || colCount <= 0) return
      const clamped: CellPosition = {
        row: Math.max(0, Math.min(rowCount - 1, pos.row)),
        col: Math.max(0, Math.min(colCount - 1, pos.col))
      }

      setSelection((cur) => {
        if (!cur) {
          const curFocus = focusRef.current
          if (curFocus && !samePosition(curFocus, clamped)) {
            return {
              primary: { anchor: curFocus, active: curFocus },
              additional: [{ anchor: clamped, active: clamped }]
            }
          }
          if (!curFocus) {
            prevFocusRef.current = clamped
            setFocus(clamped)
          }
          return {
            primary: { anchor: clamped, active: clamped },
            additional: []
          }
        }

        // Check if clamped cell is already an additional single-cell range
        const additionalIndex = cur.additional.findIndex(
          (r) =>
            r.anchor.row === clamped.row &&
            r.anchor.col === clamped.col &&
            r.active.row === clamped.row &&
            r.active.col === clamped.col
        )

        if (additionalIndex !== -1) {
          const nextAdditional = cur.additional.filter((_, idx) => idx !== additionalIndex)
          return {
            primary: cur.primary,
            additional: nextAdditional
          }
        }

        // If it matches a single-cell primary range
        const isPrimarySingle =
          cur.primary.anchor.row === clamped.row &&
          cur.primary.anchor.col === clamped.col &&
          cur.primary.active.row === clamped.row &&
          cur.primary.active.col === clamped.col

        if (isPrimarySingle) {
          if (cur.additional.length > 0) {
            const [nextPrimary, ...rest] = cur.additional
            return {
              primary: nextPrimary,
              additional: rest
            }
          }
          return null
        }

        return {
          primary: cur.primary,
          additional: [...cur.additional, { anchor: clamped, active: clamped }]
        }
      })
    },
    [rowCount, colCount, setFocus]
  )

  const extend = React.useCallback(
    (drow: number, dcol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      setSelection((cur) => {
        const anchor = cur ? cur.primary.anchor : (focusRef.current ?? { row: 0, col: 0 })
        const active = cur ? cur.primary.active : (focusRef.current ?? { row: 0, col: 0 })
        const nextActive: CellPosition = {
          row: Math.max(0, Math.min(rowCount - 1, active.row + drow)),
          col: Math.max(0, Math.min(colCount - 1, active.col + dcol))
        }

        if (!focusRef.current) {
          prevFocusRef.current = anchor
          setFocus(anchor)
        }

        return {
          primary: { anchor, active: nextActive },
          additional: cur ? cur.additional : []
        }
      })
    },
    [rowCount, colCount, setFocus]
  )

  const extendToCol = React.useCallback(
    (targetCol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      const col = Math.max(0, Math.min(colCount - 1, targetCol))
      setSelection((cur) => {
        const anchor = cur ? cur.primary.anchor : (focusRef.current ?? { row: 0, col: 0 })
        const active = cur ? cur.primary.active : (focusRef.current ?? { row: 0, col: 0 })

        if (!focusRef.current) {
          prevFocusRef.current = anchor
          setFocus(anchor)
        }

        return {
          primary: { anchor, active: { row: active.row, col } },
          additional: cur ? cur.additional : []
        }
      })
    },
    [rowCount, colCount, setFocus]
  )

  const extendToBoundary = React.useCallback(
    (targetRow: number, targetCol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      const row = Math.max(0, Math.min(rowCount - 1, targetRow))
      const col = Math.max(0, Math.min(colCount - 1, targetCol))

      setSelection((cur) => {
        const anchor = cur ? cur.primary.anchor : (focusRef.current ?? { row: 0, col: 0 })

        if (!focusRef.current) {
          prevFocusRef.current = anchor
          setFocus(anchor)
        }

        return {
          primary: { anchor, active: { row, col } },
          additional: cur ? cur.additional : []
        }
      })
    },
    [rowCount, colCount, setFocus]
  )

  const selectAll = React.useCallback(() => {
    if (rowCount <= 0 || colCount <= 0) return
    const anchor = { row: 0, col: 0 }
    const active = { row: rowCount - 1, col: colCount - 1 }

    if (!focusRef.current) {
      prevFocusRef.current = anchor
      setFocus(anchor)
    }

    setSelection({
      primary: { anchor, active },
      additional: []
    })
  }, [rowCount, colCount, setFocus])

  const handlers = React.useMemo<UseHotkeyDefinition[]>(() => {
    const opt = { enabled, preventDefault: true, target, ignoreInputs: true } as const
    return [
      { hotkey: 'Shift+ArrowDown', callback: () => extend(1, 0), options: opt },
      { hotkey: 'Shift+ArrowUp', callback: () => extend(-1, 0), options: opt },
      { hotkey: 'Shift+ArrowLeft', callback: () => extend(0, -1), options: opt },
      { hotkey: 'Shift+ArrowRight', callback: () => extend(0, 1), options: opt },
      {
        hotkey: 'Shift+Home',
        callback: () => extendToCol(0),
        options: opt
      },
      {
        hotkey: 'Shift+End',
        callback: () => extendToCol(colCount - 1),
        options: opt
      },
      {
        hotkey: 'Mod+Shift+Home',
        callback: () => extendToBoundary(0, 0),
        options: opt
      },
      {
        hotkey: 'Mod+Shift+End',
        callback: () => extendToBoundary(rowCount - 1, colCount - 1),
        options: opt
      },
      { hotkey: 'Shift+PageDown', callback: () => extend(PAGE_STEP, 0), options: opt },
      { hotkey: 'Shift+PageUp', callback: () => extend(-PAGE_STEP, 0), options: opt },
      {
        hotkey: 'Mod+A',
        callback: () => selectAll(),
        options: opt
      },
      {
        hotkey: 'Escape',
        callback: () => clear(),
        options: {
          enabled: enabled && Boolean(selectionRef.current),
          preventDefault: true,
          target,
          ignoreInputs: true
        }
      }
    ]
  }, [
    extend,
    extendToCol,
    extendToBoundary,
    selectAll,
    clear,
    rowCount,
    colCount,
    enabled,
    target,
    selection
  ])

  useHotkeys(handlers)

  return {
    selection,
    setSelection,
    extendTo,
    toggleSparse,
    clear
  }
}
