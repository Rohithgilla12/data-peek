import type { ForeignKeyInfo } from '@data-peek/shared'
import { CellFocusOverlay } from './cell-focus-overlay'
import { CellInspector } from './cell-inspector'
import { CopyFlash } from './copy-flash'
import type { UseCellGridResult } from './use-cell-grid'

interface CellGridInspectorProps {
  cellGrid: UseCellGridResult
  rowCount: number
  colCount: number
  onForeignKeyOpen?: (fk: ForeignKeyInfo, value: unknown) => void
}

/**
 * Renders the docked inspector when the hook reports it open. Placed as a
 * sibling of the scroll container so it doesn't scroll with table content.
 */
export function CellGridInspector({
  cellGrid,
  rowCount,
  colCount,
  onForeignKeyOpen
}: CellGridInspectorProps) {
  const { focus, inspectorOpen, inspectorCell, closeInspector, move } = cellGrid
  if (!inspectorOpen || !inspectorCell || !focus) return null

  const fk = inspectorCell.foreignKey
  const foreignKeyAction =
    fk && onForeignKeyOpen
      ? {
          onNavigate: () => {
            onForeignKeyOpen(fk, inspectorCell.value)
            closeInspector()
          }
        }
      : undefined

  return (
    <CellInspector
      pos={focus}
      value={inspectorCell.value}
      columnName={inspectorCell.columnName}
      dataType={inspectorCell.dataType}
      rowCount={rowCount}
      colCount={colCount}
      foreignKey={foreignKeyAction}
      onClose={closeInspector}
      onMove={move}
    />
  )
}

/**
 * The focus ring + row stripe + copy-flash pill. Lives inside the scroll
 * container so it tracks with horizontal/vertical scroll.
 */
export function CellGridOverlays({ cellGrid }: { cellGrid: UseCellGridResult }) {
  return (
    <>
      <CellFocusOverlay
        focus={cellGrid.focus}
        geometry={cellGrid.geometry}
        suppressed={cellGrid.inspectorOpen}
      />
      <CopyFlash event={cellGrid.copyFlash} geometry={cellGrid.geometry} />
    </>
  )
}
