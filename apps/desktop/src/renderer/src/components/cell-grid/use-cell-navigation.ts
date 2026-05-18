import * as React from 'react'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import type { CellPosition } from './cell-grid-types'

// PageUp/PageDown jump distance. Not viewport-derived because the hook can't
// see the rendered row count — virtualization makes that ambiguous.
const PAGE_STEP = 20

interface UseCellNavigationOptions {
  rowCount: number
  colCount: number
  enabled?: boolean
  /** Scope keyboard listeners to this element (and its children with focus) */
  target?: React.RefObject<HTMLElement | null>
  onEnter?: (pos: CellPosition) => void
  onCopy?: (pos: CellPosition) => void
  onEscape?: () => void
}

interface UseCellNavigationResult {
  focus: CellPosition | null
  setFocus: (next: CellPosition | null) => void
  move: (drow: number, dcol: number) => void
  jumpTo: (row: number, col: number) => void
}

export function useCellNavigation({
  rowCount,
  colCount,
  enabled = true,
  target,
  onEnter,
  onCopy,
  onEscape
}: UseCellNavigationOptions): UseCellNavigationResult {
  const [focus, setFocusInternal] = React.useState<CellPosition | null>(null)

  // Clamp existing focus into bounds when row/col counts shrink; clear when grid empties.
  const hasData = rowCount > 0 && colCount > 0
  React.useEffect(() => {
    if (!enabled) return
    if (!hasData) {
      setFocusInternal(null)
      return
    }
    setFocusInternal((current) => {
      if (!current) return current
      const row = Math.min(current.row, rowCount - 1)
      const col = Math.min(current.col, colCount - 1)
      if (row === current.row && col === current.col) return current
      return { row, col }
    })
  }, [enabled, hasData, rowCount, colCount])

  const setFocus = React.useCallback(
    (next: CellPosition | null) => {
      if (next === null) {
        setFocusInternal(null)
        return
      }
      if (rowCount <= 0 || colCount <= 0) return
      setFocusInternal({
        row: Math.max(0, Math.min(rowCount - 1, next.row)),
        col: Math.max(0, Math.min(colCount - 1, next.col))
      })
    },
    [rowCount, colCount]
  )

  const move = React.useCallback(
    (drow: number, dcol: number) => {
      setFocusInternal((current) => {
        if (!current) {
          if (rowCount === 0 || colCount === 0) return null
          return { row: 0, col: 0 }
        }
        const row = Math.max(0, Math.min(rowCount - 1, current.row + drow))
        const col = Math.max(0, Math.min(colCount - 1, current.col + dcol))
        if (row === current.row && col === current.col) return current
        return { row, col }
      })
    },
    [rowCount, colCount]
  )

  const jumpTo = React.useCallback(
    (row: number, col: number) => {
      if (rowCount === 0 || colCount === 0) return
      setFocusInternal({
        row: Math.max(0, Math.min(rowCount - 1, row)),
        col: Math.max(0, Math.min(colCount - 1, col))
      })
    },
    [rowCount, colCount]
  )

  const focusRef = React.useRef(focus)
  focusRef.current = focus

  const handlers = React.useMemo<UseHotkeyDefinition[]>(() => {
    const opt = { enabled, preventDefault: true, target, ignoreInputs: true } as const
    return [
      { hotkey: 'ArrowDown', callback: () => move(1, 0), options: opt },
      { hotkey: 'ArrowUp', callback: () => move(-1, 0), options: opt },
      { hotkey: 'ArrowLeft', callback: () => move(0, -1), options: opt },
      { hotkey: 'ArrowRight', callback: () => move(0, 1), options: opt },
      {
        hotkey: 'Home',
        callback: () => {
          const cur = focusRef.current
          if (cur) jumpTo(cur.row, 0)
        },
        options: opt
      },
      {
        hotkey: 'End',
        callback: () => {
          const cur = focusRef.current
          if (cur) jumpTo(cur.row, colCount - 1)
        },
        options: opt
      },
      {
        hotkey: 'Mod+Home',
        callback: () => jumpTo(0, 0),
        options: opt
      },
      {
        hotkey: 'Mod+End',
        callback: () => jumpTo(rowCount - 1, colCount - 1),
        options: opt
      },
      { hotkey: 'PageDown', callback: () => move(PAGE_STEP, 0), options: opt },
      { hotkey: 'PageUp', callback: () => move(-PAGE_STEP, 0), options: opt },
      {
        hotkey: 'Enter',
        callback: () => {
          const cur = focusRef.current
          if (cur && onEnter) onEnter(cur)
        },
        options: {
          enabled: enabled && Boolean(onEnter),
          preventDefault: true,
          target,
          ignoreInputs: true
        }
      },
      {
        hotkey: 'Escape',
        callback: () => onEscape?.(),
        options: {
          enabled: enabled && Boolean(onEscape),
          preventDefault: true,
          target,
          ignoreInputs: true
        }
      },
      {
        hotkey: 'Mod+C',
        callback: () => {
          const cur = focusRef.current
          if (cur && onCopy) onCopy(cur)
        },
        options: {
          enabled: enabled && Boolean(onCopy),
          preventDefault: false,
          target,
          ignoreInputs: true
        }
      }
    ]
  }, [move, jumpTo, rowCount, colCount, enabled, onEnter, onCopy, onEscape, target])

  useHotkeys(handlers)

  return { focus, setFocus, move, jumpTo }
}
