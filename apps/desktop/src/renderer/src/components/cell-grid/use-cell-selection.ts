import * as React from 'react'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import type { CellPosition, CellSelection, CellRange } from './cell-grid-types'

export function samePosition(a: CellPosition | null, b: CellPosition | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.row === b.row && a.col === b.col
}

export const PAGE_STEP = 20

export function clampPos(p: CellPosition, rowCount: number, colCount: number): CellPosition {
  return {
    row: Math.max(0, Math.min(rowCount - 1, p.row)),
    col: Math.max(0, Math.min(colCount - 1, p.col))
  }
}

export function clampRange(r: CellRange, rowCount: number, colCount: number): CellRange {
  return {
    anchor: clampPos(r.anchor, rowCount, colCount),
    active: clampPos(r.active, rowCount, colCount)
  }
}

export function clampSelectionBounds(
  selection: CellSelection | null,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (!selection || rowCount <= 0 || colCount <= 0) return null
  return {
    primary: clampRange(selection.primary, rowCount, colCount),
    additional: selection.additional.map((r) => clampRange(r, rowCount, colCount))
  }
}

export function extendSelectionRange(
  cur: CellSelection | null,
  pos: CellPosition,
  anchorFallback: CellPosition,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const clamped = clampPos(pos, rowCount, colCount)
  if (cur) {
    return {
      primary: { anchor: cur.primary.anchor, active: clamped },
      additional: cur.additional
    }
  }
  const anchor = clampPos(anchorFallback, rowCount, colCount)
  return {
    primary: { anchor, active: clamped },
    additional: []
  }
}

export function toggleSparseCell(
  cur: CellSelection | null,
  pos: CellPosition,
  focusFallback: CellPosition | null,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const clamped = clampPos(pos, rowCount, colCount)

  if (!cur) {
    if (focusFallback && !samePosition(focusFallback, clamped)) {
      const clampedFocus = clampPos(focusFallback, rowCount, colCount)
      return {
        primary: { anchor: clampedFocus, active: clampedFocus },
        additional: [{ anchor: clamped, active: clamped }]
      }
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
    return {
      primary: cur.primary,
      additional: cur.additional.filter((_, idx) => idx !== additionalIndex)
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
}

export function extendSelectionByDelta(
  cur: CellSelection | null,
  drow: number,
  dcol: number,
  anchorFallback: CellPosition,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const anchor = cur ? cur.primary.anchor : clampPos(anchorFallback, rowCount, colCount)
  const active = cur ? cur.primary.active : clampPos(anchorFallback, rowCount, colCount)
  const nextActive = clampPos(
    { row: active.row + drow, col: active.col + dcol },
    rowCount,
    colCount
  )
  return {
    primary: { anchor, active: nextActive },
    additional: cur ? cur.additional : []
  }
}

export function extendSelectionToCol(
  cur: CellSelection | null,
  targetCol: number,
  anchorFallback: CellPosition,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const col = Math.max(0, Math.min(colCount - 1, targetCol))
  const anchor = cur ? cur.primary.anchor : clampPos(anchorFallback, rowCount, colCount)
  const active = cur ? cur.primary.active : clampPos(anchorFallback, rowCount, colCount)
  return {
    primary: { anchor, active: { row: active.row, col } },
    additional: cur ? cur.additional : []
  }
}

export function extendSelectionToBoundary(
  cur: CellSelection | null,
  targetRow: number,
  targetCol: number,
  anchorFallback: CellPosition,
  rowCount: number,
  colCount: number
): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const row = Math.max(0, Math.min(rowCount - 1, targetRow))
  const col = Math.max(0, Math.min(colCount - 1, targetCol))
  const anchor = cur ? cur.primary.anchor : clampPos(anchorFallback, rowCount, colCount)
  return {
    primary: { anchor, active: { row, col } },
    additional: cur ? cur.additional : []
  }
}

export function selectAllCells(rowCount: number, colCount: number): CellSelection | null {
  if (rowCount <= 0 || colCount <= 0) return null
  return {
    primary: {
      anchor: { row: 0, col: 0 },
      active: { row: rowCount - 1, col: colCount - 1 }
    },
    additional: []
  }
}

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

  const prevDimsRef = React.useRef({ rowCount, colCount })

  // Collapse selection when focus moves via plain navigation / mouse click,
  // but DO NOT clear when focus moves as a result of grid dimensions changing (clamping).
  const prevFocusRef = React.useRef(focus)
  React.useEffect(() => {
    const dimsChanged =
      prevDimsRef.current.rowCount !== rowCount || prevDimsRef.current.colCount !== colCount
    if (dimsChanged) {
      prevDimsRef.current = { rowCount, colCount }
      prevFocusRef.current = focus
      return
    }

    if (!samePosition(prevFocusRef.current, focus)) {
      prevFocusRef.current = focus
      setSelection(null)
    }
  }, [focus, rowCount, colCount])

  // Clamp selection bounds if rowCount / colCount shrink; clear if grid is empty
  const hasData = rowCount > 0 && colCount > 0
  React.useEffect(() => {
    if (!enabled) return
    if (!hasData) {
      setSelection(null)
      return
    }

    setSelection((cur) => clampSelectionBounds(cur, rowCount, colCount))
  }, [enabled, hasData, rowCount, colCount])

  const clear = React.useCallback(() => {
    setSelection(null)
  }, [])

  const extendTo = React.useCallback(
    (pos: CellPosition) => {
      if (rowCount <= 0 || colCount <= 0) return
      const fallback = focusRef.current ?? { row: 0, col: 0 }
      if (!focusRef.current) {
        const clampedFallback = clampPos(pos, rowCount, colCount)
        prevFocusRef.current = clampedFallback
        setFocus(clampedFallback)
      }
      setSelection((cur) => extendSelectionRange(cur, pos, fallback, rowCount, colCount))
    },
    [rowCount, colCount, setFocus]
  )

  const toggleSparse = React.useCallback(
    (pos: CellPosition) => {
      if (rowCount <= 0 || colCount <= 0) return
      if (!focusRef.current) {
        const clamped = clampPos(pos, rowCount, colCount)
        prevFocusRef.current = clamped
        setFocus(clamped)
      }
      setSelection((cur) => toggleSparseCell(cur, pos, focusRef.current, rowCount, colCount))
    },
    [rowCount, colCount, setFocus]
  )

  const extend = React.useCallback(
    (drow: number, dcol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      const fallback = focusRef.current ?? { row: 0, col: 0 }
      if (!focusRef.current) {
        prevFocusRef.current = fallback
        setFocus(fallback)
      }
      setSelection((cur) => extendSelectionByDelta(cur, drow, dcol, fallback, rowCount, colCount))
    },
    [rowCount, colCount, setFocus]
  )

  const extendToCol = React.useCallback(
    (targetCol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      const fallback = focusRef.current ?? { row: 0, col: 0 }
      if (!focusRef.current) {
        prevFocusRef.current = fallback
        setFocus(fallback)
      }
      setSelection((cur) => extendSelectionToCol(cur, targetCol, fallback, rowCount, colCount))
    },
    [rowCount, colCount, setFocus]
  )

  const extendToBoundary = React.useCallback(
    (targetRow: number, targetCol: number) => {
      if (rowCount <= 0 || colCount <= 0) return
      const fallback = focusRef.current ?? { row: 0, col: 0 }
      if (!focusRef.current) {
        prevFocusRef.current = fallback
        setFocus(fallback)
      }
      setSelection((cur) =>
        extendSelectionToBoundary(cur, targetRow, targetCol, fallback, rowCount, colCount)
      )
    },
    [rowCount, colCount, setFocus]
  )

  const selectAll = React.useCallback(() => {
    if (rowCount <= 0 || colCount <= 0) return
    const anchor = { row: 0, col: 0 }
    if (!focusRef.current) {
      prevFocusRef.current = anchor
      setFocus(anchor)
    }
    setSelection(selectAllCells(rowCount, colCount))
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
          enabled: enabled && Boolean(selection),
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
