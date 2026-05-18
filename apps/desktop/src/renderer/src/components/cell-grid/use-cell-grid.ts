import * as React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { ForeignKeyInfo } from '@data-peek/shared'
import { buildGeometry, type CellGridGeometry, type CellPosition } from './cell-grid-types'
import { useCellNavigation } from './use-cell-navigation'

export interface CellSnapshot {
  value: unknown
  columnName: string
  dataType: string
  foreignKey?: ForeignKeyInfo
}

export interface CellCopyEvent {
  pos: CellPosition
  nonce: number
}

interface UseCellGridOptions {
  rowCount: number
  colCount: number
  columnWidths: number[]
  rowHeight: number
  headerHeight: number
  /** Changes on new query (new column set). Triggers auto-focus to (0,0). */
  columnKey: string
  containerRef: React.RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  getCell: (pos: CellPosition) => CellSnapshot
  enabled?: boolean
}

interface UseCellGridResult {
  focus: CellPosition | null
  geometry: CellGridGeometry
  inspectorOpen: boolean
  /** Current cell snapshot when the inspector is open; tracks focus so arrow keys scrub live. */
  inspectorCell: CellSnapshot | null
  copyFlash: CellCopyEvent | null
  move: (drow: number, dcol: number) => void
  closeInspector: () => void
  handleGridClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useCellGrid({
  rowCount,
  colCount,
  columnWidths,
  rowHeight,
  headerHeight,
  columnKey,
  containerRef,
  virtualizer,
  getCell,
  enabled = true
}: UseCellGridOptions): UseCellGridResult {
  const geometry = React.useMemo(
    () => buildGeometry(columnWidths, rowHeight, headerHeight),
    [columnWidths, rowHeight, headerHeight]
  )

  const ready = enabled && columnWidths.length > 0

  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [copyFlash, setCopyFlash] = React.useState<CellCopyEvent | null>(null)
  const copyFlashNonce = React.useRef(0)

  const closeInspector = React.useCallback(() => {
    setInspectorOpen(false)
    requestAnimationFrame(() => containerRef.current?.focus({ preventScroll: true }))
  }, [containerRef])

  const openInspector = React.useCallback(() => {
    setInspectorOpen(true)
  }, [])

  const handleCopy = React.useCallback(
    async (pos: CellPosition) => {
      const { value } = getCell(pos)
      if (value === null || value === undefined) return
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
      try {
        await navigator.clipboard.writeText(text)
        copyFlashNonce.current += 1
        setCopyFlash({ pos, nonce: copyFlashNonce.current })
      } catch (err) {
        console.error('Cell copy failed:', err)
      }
    },
    [getCell]
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

  // Auto-focus (0,0) when columnKey changes (new query). Filter/sort/pagination
  // keep the same columnKey so focus is preserved.
  const lastColumnKey = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!ready) return
    if (lastColumnKey.current === columnKey) return
    if (rowCount === 0 || colCount === 0) return
    lastColumnKey.current = columnKey
    setFocus({ row: 0, col: 0 })
  }, [ready, columnKey, rowCount, colCount, setFocus])

  // If rows drain to 0 while inspector is open, close it so we don't display stale defaults.
  React.useEffect(() => {
    if (inspectorOpen && (rowCount === 0 || colCount === 0)) {
      setInspectorOpen(false)
    }
  }, [inspectorOpen, rowCount, colCount])

  // Scroll focused cell into view.
  React.useEffect(() => {
    if (!focus || !containerRef.current) return
    virtualizer.scrollToIndex(focus.row, { align: 'auto' })
    const container = containerRef.current
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
      setFocus({ row, col })
      containerRef.current?.focus({ preventScroll: true })
    },
    [ready, setFocus, containerRef]
  )

  const inspectorCell = React.useMemo(() => {
    if (!inspectorOpen || !focus) return null
    return getCell(focus)
  }, [inspectorOpen, focus, getCell])

  return {
    focus,
    geometry,
    inspectorOpen,
    inspectorCell,
    copyFlash,
    move,
    closeInspector,
    handleGridClick
  }
}
