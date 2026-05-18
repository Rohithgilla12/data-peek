import * as React from 'react'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import type { CellPosition } from './cell-grid-context'

interface UseCellNavigationOptions {
  rowCount: number
  colCount: number
  enabled?: boolean
  /** Scope keyboard listeners to this element (and its children with focus) */
  target?: React.RefObject<HTMLElement | null>
  onEnter?: (pos: CellPosition) => void
  onCopy?: (pos: CellPosition) => void
}

interface UseCellNavigationResult {
  focus: CellPosition | null
  setFocus: React.Dispatch<React.SetStateAction<CellPosition | null>>
  move: (drow: number, dcol: number) => void
  jumpTo: (row: number, col: number) => void
}

export function useCellNavigation({
  rowCount,
  colCount,
  enabled = true,
  target,
  onEnter,
  onCopy
}: UseCellNavigationOptions): UseCellNavigationResult {
  const [focus, setFocus] = React.useState<CellPosition | null>(null)

  // Auto-focus first cell when grid has data and no focus yet
  const hasData = rowCount > 0 && colCount > 0
  React.useEffect(() => {
    if (!enabled) return
    if (!hasData) {
      setFocus(null)
      return
    }
    setFocus((current) => {
      if (current) {
        const row = Math.min(current.row, rowCount - 1)
        const col = Math.min(current.col, colCount - 1)
        if (row === current.row && col === current.col) return current
        return { row, col }
      }
      return null
    })
  }, [enabled, hasData, rowCount, colCount])

  const move = React.useCallback(
    (drow: number, dcol: number) => {
      setFocus((current) => {
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
      setFocus({
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
      { hotkey: 'Tab', callback: () => move(0, 1), options: opt },
      { hotkey: 'Shift+Tab', callback: () => move(0, -1), options: opt },
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
      { hotkey: 'PageDown', callback: () => move(20, 0), options: opt },
      { hotkey: 'PageUp', callback: () => move(-20, 0), options: opt },
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
  }, [move, jumpTo, rowCount, colCount, enabled, onEnter, onCopy, target])

  useHotkeys(handlers)

  return { focus, setFocus, move, jumpTo }
}
