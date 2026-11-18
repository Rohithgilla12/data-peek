import * as React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import {
  buildGeometry,
  containsCell,
  rangeBounds,
  type CellCopyEvent,
  type CellGridGeometry,
  type CellPosition,
  type CellSelection,
  type CellSnapshot
} from './cell-grid-types'
import { useCellNavigation } from './use-cell-navigation'
import { useCellSelection } from './use-cell-selection'
import {
  cellText,
  serializeSelection,
  type SelectionFormat,
  type SerializeSelectionOptions
} from '@/lib/selection-serialize'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

const FORMAT_LABEL: Record<SelectionFormat, string> = {
  tsv: 'TSV',
  csv: 'CSV',
  json: 'JSON',
  markdown: 'Markdown'
}

export interface SelectionCopyTarget {
  /** True when a multi-cell selection exists and its primary range, the part copy serializes, holds pos. */
  covers: (pos: CellPosition) => boolean
  copy: (format: SelectionFormat, options?: SerializeSelectionOptions) => void
}

interface UseCellGridOptions {
  rowCount: number
  colCount: number
  /** Identifies the result's schema; a change re-seeds focus at the first cell. */
  columnKey: string
  /**
   * The table's view of a cell, with masked values already nulled. Copy, stats,
   * and the inspector all read through it so none of them can leak a masked value.
   */
  getCell: (pos: CellPosition) => CellSnapshot
  columnWidths: number[]
  rowHeight: number
  headerHeight: number
  containerRef: React.RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
}

export interface UseCellGridResult {
  focus: CellPosition | null
  geometry: CellGridGeometry
  inspectorOpen: boolean
  /** Current cell snapshot when the inspector is open; tracks focus so arrow keys scrub live. */
  inspectorCell: CellSnapshot | null
  copyFlash: CellCopyEvent | null
  selection: CellSelection | null
  selectionCopy: SelectionCopyTarget
  setFocus: (next: CellPosition | null) => void
  setSelection: (next: CellSelection | null) => void
  extendTo: (pos: CellPosition) => void
  toggleSparse: (pos: CellPosition) => void
  clearSelection: () => void
  move: (drow: number, dcol: number) => void
  closeInspector: () => void
  handleGridClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useCellGrid({
  rowCount,
  colCount,
  columnKey,
  getCell,
  columnWidths,
  rowHeight,
  headerHeight,
  containerRef,
  virtualizer
}: UseCellGridOptions): UseCellGridResult {
  const geometry = React.useMemo(
    () => buildGeometry(columnWidths, rowHeight, headerHeight),
    [columnWidths, rowHeight, headerHeight]
  )

  const ready = columnWidths.length > 0

  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [copyFlash, setCopyFlash] = React.useState<CellCopyEvent | null>(null)

  const closeInspector = React.useCallback(() => {
    setInspectorOpen(false)
    requestAnimationFrame(() => containerRef.current?.focus({ preventScroll: true }))
  }, [containerRef])

  const openInspector = React.useCallback(() => {
    setInspectorOpen(true)
  }, [])

  // Each pos is captured on call so the success callback fires the pill at the
  // right cell even if focus has moved by the time the clipboard write resolves.
  const pendingFlash = React.useRef<CellCopyEvent | null>(null)
  const { copy } = useCopyToClipboard({
    onSuccess: () => {
      if (pendingFlash.current) setCopyFlash(pendingFlash.current)
    }
  })

  const selectionRef = React.useRef<CellSelection | null>(null)

  const copySelection = React.useCallback(
    (format: SelectionFormat, options?: SerializeSelectionOptions) => {
      const currentSelection = selectionRef.current
      if (!currentSelection) return
      const text = serializeSelection(currentSelection, format, getCell, options)
      const { r1, c1, r2, c2 } = rangeBounds(currentSelection.primary)
      pendingFlash.current = {
        pos: currentSelection.primary.active,
        kind: 'range',
        count: (r2 - r1 + 1) * (c2 - c1 + 1),
        label: format === 'tsv' && !options?.includeHeaders ? undefined : FORMAT_LABEL[format]
      }
      void copy(text)
    },
    [getCell, copy]
  )

  const handleCopy = React.useCallback(
    (pos: CellPosition) => {
      if (selectionRef.current) {
        copySelection('tsv')
        return
      }
      const text = cellText(getCell(pos).value)
      if (text === null) return
      pendingFlash.current = { pos, kind: 'cell', count: 1 }
      void copy(text)
    },
    [getCell, copy, copySelection]
  )

  const selectionCopy = React.useMemo<SelectionCopyTarget>(
    () => ({
      covers: (pos) => {
        const current = selectionRef.current
        if (!current) return false
        const { r1, c1, r2, c2 } = rangeBounds(current.primary)
        const isMulti = r1 !== r2 || c1 !== c2 || current.additional.length > 0
        return isMulti && containsCell(current.primary, pos)
      },
      copy: copySelection
    }),
    [copySelection]
  )

  const { focus, setFocus, move } = useCellNavigation({
    rowCount,
    colCount,
    enabled: ready,
    target: containerRef,
    onEnter: openInspector,
    onEscape: inspectorOpen ? closeInspector : undefined,
    onCopy: handleCopy
  })

  const {
    selection,
    setSelection,
    extendTo,
    toggleSparse,
    clear: clearSelection
  } = useCellSelection({
    rowCount,
    colCount,
    enabled: ready,
    target: containerRef,
    focus,
    setFocus
  })

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const lastColumnKey = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!ready) return
    if (lastColumnKey.current === columnKey) return
    if (rowCount === 0 || colCount === 0) return
    lastColumnKey.current = columnKey
    setFocus({ row: 0, col: 0 })
  }, [ready, columnKey, rowCount, colCount, setFocus])

  React.useEffect(() => {
    if (inspectorOpen && (rowCount === 0 || colCount === 0)) {
      setInspectorOpen(false)
    }
  }, [inspectorOpen, rowCount, colCount])

  // Vertical scroll-into-view only triggers on row change (column moves can't
  // affect vertical position). Horizontal scroll always recomputes.
  const lastFocusRow = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!focus || !containerRef.current) return
    const container = containerRef.current
    if (focus.row !== lastFocusRow.current) {
      virtualizer.scrollToIndex(focus.row, { align: 'auto' })
      lastFocusRow.current = focus.row
    }
    const x = geometry.columnOffsets[focus.col] ?? 0
    const w = geometry.columnWidths[focus.col] ?? 0
    const left = container.scrollLeft
    const right = left + container.clientWidth
    if (x < left) {
      container.scrollLeft = Math.max(0, x - 12)
    } else if (x + w > right) {
      container.scrollLeft = x + w - container.clientWidth + 12
    }
  }, [focus, virtualizer, geometry, containerRef])

  const handleGridClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ready) return
      const target = e.target as HTMLElement
      const cell = target.closest<HTMLElement>('[data-cell-row][data-cell-col]')
      if (!cell) return
      const row = Number(cell.dataset.cellRow)
      const col = Number(cell.dataset.cellCol)
      if (Number.isNaN(row) || Number.isNaN(col)) return
      const pos = { row, col }
      if (e.shiftKey) {
        extendTo(pos)
      } else if (e.metaKey || e.ctrlKey) {
        toggleSparse(pos)
      } else {
        // Selection only collapses when focus moves, so a plain click on the
        // already-focused cell has to clear it explicitly.
        clearSelection()
        setFocus(pos)
      }
      containerRef.current?.focus({ preventScroll: true })
    },
    [ready, extendTo, toggleSparse, clearSelection, setFocus, containerRef]
  )

  const inspectorCell = React.useMemo(
    () => (inspectorOpen && focus ? getCell(focus) : null),
    [inspectorOpen, focus, getCell]
  )

  return {
    focus,
    geometry,
    inspectorOpen,
    inspectorCell,
    copyFlash,
    selection,
    selectionCopy,
    setFocus,
    setSelection,
    extendTo,
    toggleSparse,
    clearSelection,
    move,
    closeInspector,
    handleGridClick
  }
}
