import type * as React from 'react'
import type { ForeignKeyInfo } from '@data-peek/shared'
import { CellFocusOverlay } from './cell-focus-overlay'
import { CellInspector } from './cell-inspector'
import { CellSelectionOverlay } from './cell-selection-overlay'
import { CellFindBar } from './cell-find-bar'
import { CopyFlash } from './copy-flash'
import { FindMatchOverlay } from './find-match-overlay'
import type { UseCellGridResult } from './use-cell-grid'
import type { GridFind } from './use-grid-find'

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
 * The VS Code style find bar, floating top-right over the grid. Placed as a
 * sibling of the scroll container so it stays put while the grid scrolls.
 */
export function GridFindBar({
  find,
  target
}: {
  find: GridFind
  /** The element that owns Mod+F, Mod+G and Mod+Shift+G. */
  target: React.RefObject<HTMLElement | null>
}) {
  const { result, query } = find
  return (
    <CellFindBar
      open={find.open}
      onOpenChange={find.setOpen}
      onClose={find.close}
      needle={query.needle}
      onNeedleChange={(needle) => find.setQuery({ needle })}
      caseSensitive={query.caseSensitive}
      onCaseSensitiveChange={(caseSensitive) => find.setQuery({ caseSensitive })}
      regex={query.regex}
      onRegexChange={(regex) => find.setQuery({ regex })}
      onFindNext={() => find.step(1)}
      onFindPrev={() => find.step(-1)}
      matchCount={result.kind === 'ok' ? result.matches.length : undefined}
      currentMatchIndex={find.current ?? undefined}
      error={result.kind === 'invalid-regex' ? result.message : undefined}
      target={target}
      className="absolute top-2 right-3 z-30"
    />
  )
}

/**
 * The selection layer + focus ring + row stripe + copy-flash pill, plus find
 * highlights when a find is given. Lives inside the scroll container so it
 * tracks with horizontal/vertical scroll.
 */
export function CellGridOverlays({
  cellGrid,
  find,
  rowWindow
}: {
  cellGrid: UseCellGridResult
  find?: GridFind
  /** Inclusive range of rendered rows, so find highlights skip rows that aren't on screen. */
  rowWindow?: { start: number; end: number }
}) {
  return (
    <>
      {find?.open && (
        <FindMatchOverlay
          matches={find.pageMatches}
          current={find.currentPos}
          geometry={cellGrid.geometry}
          rowWindow={rowWindow ?? { start: 0, end: Number.MAX_SAFE_INTEGER }}
        />
      )}
      <CellSelectionOverlay
        selection={cellGrid.selection}
        geometry={cellGrid.geometry}
        suppressed={cellGrid.inspectorOpen}
      />
      <CellFocusOverlay
        focus={cellGrid.focus}
        geometry={cellGrid.geometry}
        suppressed={cellGrid.inspectorOpen}
      />
      <CopyFlash event={cellGrid.copyFlash} geometry={cellGrid.geometry} />
    </>
  )
}
