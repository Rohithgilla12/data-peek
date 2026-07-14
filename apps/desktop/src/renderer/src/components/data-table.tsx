import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef
} from '@tanstack/react-table'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ArrowUp, ArrowDown, Link2, Copy, BarChart2, Lock, Unlock } from 'lucide-react'
import type { ForeignKeyInfo } from '@data-peek/shared'
import { RowContextMenu } from '@/components/row-context-menu'
import {
  Button,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@data-peek/ui'

import { JsonCellValue } from '@/components/json-cell-value'
import { FKCellValue } from '@/components/fk-cell-value'
import { SmartFilterBar, chipMatchesRow, type FilterChip } from '@/components/smart-filter-bar'
import {
  SmartSortBar,
  applySorts,
  toggleColumnSort,
  type SortChip
} from '@/components/smart-sort-bar'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getTypeColor } from '@/lib/type-colors'
import { PaginationControls } from '@/components/pagination-controls'
import { useSettingsStore } from '@/stores/settings-store'
import { useMaskingStore } from '@/stores/masking-store'
import { CellGridInspector, CellGridOverlays, useCellGrid } from '@/components/cell-grid'
import { WatchDecorationOverlay } from '@/components/cell-grid/watch-decoration-overlay'
import { useWatchStore } from '@/stores/watch-store'
import type { WatchDiff } from '@/lib/watch-types'
import { cellKey, deriveRowKey, type KeyingPlan } from '@/lib/watch-row-keying'

const VIRTUALIZATION_THRESHOLD = 50
const ROW_HEIGHT = 37

// Export types for parent components
export interface DataTableFilter {
  column: string
  value: string
}

export interface DataTableSort {
  column: string
  direction: 'asc' | 'desc'
}

export interface DataTableColumn {
  name: string
  dataType: string
  foreignKey?: ForeignKeyInfo
}

interface DataTableProps<TData> {
  tabId?: string
  columns: DataTableColumn[]
  data: TData[]
  pageSize?: number
  onFiltersChange?: (filters: DataTableFilter[]) => void
  onSortingChange?: (sorting: DataTableSort[]) => void
  onPageSizeChange?: (size: number) => void
  onApplyToQuery?: () => void
  /** Called when user clicks a FK cell (opens panel) */
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  /** Called when user Cmd+clicks a FK cell (opens new tab) */
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  /** Called when user requests column statistics for a column */
  onColumnStatsClick?: (column: DataTableColumn) => void
  /**
   * Pinned cell-diff decorations (Time Machine compare view). Unlike the watch
   * overlay these never fade, and small (non-virtualized) results get inline
   * cell tints since the geometry overlay only exists above the threshold.
   */
  diffOverlay?: WatchDiff | null
}

const CellValue = React.memo(function CellValue({
  value,
  dataType,
  columnName,
  foreignKey,
  onForeignKeyClick,
  onForeignKeyOpenTab
}: {
  value: unknown
  dataType: string
  columnName?: string
  foreignKey?: ForeignKeyInfo
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
}) {
  const { copied, copy } = useCopyToClipboard({ resetDelay: 1500 })
  const lowerType = dataType.toLowerCase()

  // Handle JSON/JSONB types specially
  if (lowerType.includes('json')) {
    return <JsonCellValue value={value} columnName={columnName} />
  }

  // Handle Foreign Key columns
  if (foreignKey && value !== null && value !== undefined) {
    return (
      <FKCellValue
        value={value}
        foreignKey={foreignKey}
        onForeignKeyClick={onForeignKeyClick}
        onForeignKeyOpenTab={onForeignKeyOpenTab}
      />
    )
  }

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">NULL</span>
  }

  // Handle boolean types with colored display
  if (lowerType.includes('bool')) {
    const boolVal = value === true || value === 'true' || value === 't' || value === 1
    return (
      <button
        type="button"
        onClick={() => copy(String(value))}
        className={`text-xs font-mono px-1.5 py-0.5 -mx-1 rounded hover:bg-accent/50 transition-colors ${
          boolVal ? 'text-green-500' : 'text-red-400'
        }`}
      >
        {String(value)}
      </button>
    )
  }

  const stringValue = String(value)
  const isLong = stringValue.length > 50
  const isMono =
    lowerType.includes('uuid') ||
    lowerType.includes('int') ||
    lowerType.includes('numeric') ||
    lowerType.includes('decimal') ||
    lowerType.includes('float') ||
    lowerType.includes('double') ||
    lowerType.includes('money')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => copy(stringValue)}
            className={`text-left truncate max-w-[300px] hover:bg-accent/50 px-1 -mx-1 rounded transition-colors ${isMono ? 'font-mono text-xs' : ''}`}
          >
            {isLong ? stringValue.substring(0, 50) + '...' : stringValue}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-md">
          <div className="flex items-start gap-2">
            <pre className="text-xs whitespace-pre-wrap break-all flex-1">{stringValue}</pre>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => copy(stringValue)}
            >
              <Copy className="size-3" />
            </Button>
          </div>
          {copied && <p className="text-xs text-green-500 mt-1">Copied!</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

const MaskedCell = React.memo(function MaskedCell({
  isMasked,
  hoverToPeek,
  children
}: {
  isMasked: boolean
  hoverToPeek: boolean
  children: React.ReactNode
}) {
  const [peeking, setPeeking] = React.useState(false)

  if (!isMasked) return <>{children}</>

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!hoverToPeek) return
    if (e.altKey) {
      if (!peeking) setPeeking(true)
    } else if (peeking) {
      setPeeking(false)
    }
  }

  const handleMouseLeave = () => setPeeking(false)

  return (
    <span
      style={peeking ? undefined : { filter: 'blur(5px)', userSelect: 'none' }}
      onMouseEnter={handleMouseMove}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="inline-block select-none"
    >
      {children}
    </span>
  )
})

export function DataTable<TData extends Record<string, unknown>>({
  tabId,
  columns: columnDefs,
  data,
  pageSize: propPageSize,
  onFiltersChange,
  onSortingChange,
  onPageSizeChange,
  onApplyToQuery,
  onForeignKeyClick,
  onForeignKeyOpenTab,
  onColumnStatsClick,
  diffOverlay
}: DataTableProps<TData>) {
  const { defaultPageSize } = useSettingsStore()
  const toggleColumnMask = useMaskingStore((s) => s.toggleColumnMask)
  const hoverToPeek = useMaskingStore((s) => s.hoverToPeek)
  const maskedColumnsMap = useMaskingStore((s) => s.maskedColumns)
  const autoMaskRules = useMaskingStore((s) => s.autoMaskRules)
  const autoMaskEnabled = useMaskingStore((s) => s.autoMaskEnabled)
  const getEffectiveMaskedColumns = useMaskingStore((s) => s.getEffectiveMaskedColumns)

  const allColumnNames = React.useMemo(() => columnDefs.map((c) => c.name), [columnDefs])
  const effectiveMasked = React.useMemo(
    () => (tabId ? getEffectiveMaskedColumns(tabId, allColumnNames) : new Set<string>()),
    [
      tabId,
      allColumnNames,
      getEffectiveMaskedColumns,
      maskedColumnsMap,
      autoMaskRules,
      autoMaskEnabled
    ]
  )
  const pageSize = propPageSize ?? defaultPageSize
  const [sortChips, setSortChips] = React.useState<SortChip[]>([])
  const [filterChips, setFilterChips] = React.useState<FilterChip[]>([])

  const sortedData = React.useMemo(() => {
    if (sortChips.length === 0) return data
    return applySorts(data, sortChips, columnDefs)
  }, [data, sortChips, columnDefs])

  const toggleHeaderSort = React.useCallback(
    (col: { name: string; dataType: string }, multi: boolean) => {
      setSortChips((prev) => toggleColumnSort(prev, col, { multi }))
    },
    []
  )

  const globalFilterFn = React.useCallback(
    (row: { original: unknown }): boolean => {
      if (filterChips.length === 0) return true
      return filterChips.every((chip) =>
        chipMatchesRow(chip, row.original as Record<string, unknown>)
      )
    },
    [filterChips]
  )

  const handleFilterChange = React.useCallback(
    (chips: FilterChip[]) => {
      setFilterChips(chips)
      if (onFiltersChange) {
        const filters: DataTableFilter[] = chips
          .filter((c) => c.column !== null)
          .map((c) => ({
            column: c.column!,
            value: c.value
          }))
        onFiltersChange(filters)
      }
    },
    [onFiltersChange]
  )

  // Notify parent of sorting changes
  React.useEffect(() => {
    if (onSortingChange) {
      const sorts: DataTableSort[] = sortChips.map((c) => ({
        column: c.column,
        direction: c.direction
      }))
      onSortingChange(sorts)
    }
  }, [sortChips, onSortingChange])

  // Generate TanStack Table columns from column definitions
  const columns = React.useMemo<ColumnDef<TData>[]>(
    () =>
      columnDefs.map((col, index) => {
        // Generate a stable id for columns - MSSQL can return empty names for aggregates like COUNT(*)
        const columnId = col.name || `_col_${index}`
        const displayName = col.name || `(column ${index + 1})`

        const lowerType = col.dataType.toLowerCase()
        const isNumeric =
          lowerType.includes('int') ||
          lowerType.includes('numeric') ||
          lowerType.includes('decimal') ||
          lowerType.includes('float') ||
          lowerType.includes('double') ||
          lowerType.includes('real') ||
          lowerType.includes('money')

        return {
          id: columnId,
          accessorKey: col.name,
          enableSorting: false,
          header: () => {
            const activeChip = sortChips.find((c) => c.column === col.name)
            const activeRank = activeChip
              ? sortChips.findIndex((c) => c.column === col.name) + 1
              : 0
            const isMasked = effectiveMasked.has(col.name)
            return (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    className="h-auto py-1 px-2 -mx-2 font-medium hover:bg-accent/50 flex-1"
                    onClick={(e) => toggleHeaderSort(col, e.shiftKey || e.metaKey || e.ctrlKey)}
                    title="Click to sort, Shift+click for multi-sort"
                  >
                    <span>{displayName}</span>
                    {isMasked && <Lock className="ml-1 size-3 text-amber-500" />}
                    {col.foreignKey && <Link2 className="ml-1 size-3 text-blue-400" />}
                    <Badge
                      variant="outline"
                      className={`ml-1.5 text-[9px] px-1 py-0 font-mono ${getTypeColor(col.dataType)}`}
                    >
                      {col.dataType}
                    </Badge>
                    {activeChip ? (
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        {activeChip.direction === 'asc' ? (
                          <ArrowUp className="size-3 text-primary" />
                        ) : (
                          <ArrowDown className="size-3 text-primary" />
                        )}
                        {sortChips.length > 1 && (
                          <span className="text-[9px] font-mono font-semibold text-primary/80 tabular-nums">
                            {activeRank}
                          </span>
                        )}
                      </span>
                    ) : (
                      <ArrowUpDown className="ml-1 size-3 opacity-50" />
                    )}
                  </Button>
                  {(onColumnStatsClick || tabId) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 ml-0.5 opacity-0 group-hover/head:opacity-100 hover:opacity-100 focus:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <BarChart2 className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onColumnStatsClick && (
                          <DropdownMenuItem onClick={() => onColumnStatsClick(col)}>
                            <BarChart2 className="size-3 mr-2" />
                            Column Statistics
                          </DropdownMenuItem>
                        )}
                        {onColumnStatsClick && tabId && <DropdownMenuSeparator />}
                        {tabId && (
                          <DropdownMenuItem onClick={() => toggleColumnMask(tabId, col.name)}>
                            {isMasked ? (
                              <>
                                <Unlock className="size-3 mr-2" />
                                Unmask Column
                              </>
                            ) : (
                              <>
                                <Lock className="size-3 mr-2" />
                                Mask Column
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {col.foreignKey && (
                  <span className="text-[9px] text-muted-foreground px-2 -mt-0.5">
                    → {col.foreignKey.referencedTable}
                  </span>
                )}
              </div>
            )
          },
          cell: ({ getValue }) => {
            const isMasked = effectiveMasked.has(col.name)
            return (
              <MaskedCell isMasked={isMasked} hoverToPeek={hoverToPeek}>
                <CellValue
                  value={getValue()}
                  dataType={col.dataType}
                  columnName={col.name}
                  foreignKey={col.foreignKey}
                  onForeignKeyClick={onForeignKeyClick}
                  onForeignKeyOpenTab={onForeignKeyOpenTab}
                />
              </MaskedCell>
            )
          },
          filterFn: isNumeric
            ? (row, columnId, filterValue) => {
                const value = row.getValue(columnId)
                if (value === null || value === undefined) return false
                const numValue = Number(value)
                const filterStr = String(filterValue).trim()

                // Support range filters: "10-20", ">5", "<100", ">=50", "<=75"
                if (filterStr.startsWith('>=')) {
                  const threshold = parseFloat(filterStr.slice(2))
                  return !isNaN(threshold) && numValue >= threshold
                }
                if (filterStr.startsWith('<=')) {
                  const threshold = parseFloat(filterStr.slice(2))
                  return !isNaN(threshold) && numValue <= threshold
                }
                if (filterStr.startsWith('>')) {
                  const threshold = parseFloat(filterStr.slice(1))
                  return !isNaN(threshold) && numValue > threshold
                }
                if (filterStr.startsWith('<')) {
                  const threshold = parseFloat(filterStr.slice(1))
                  return !isNaN(threshold) && numValue < threshold
                }
                const rangeMatch = filterStr.match(/^(-?\d+(\.\d+)?)\s*-\s*(-?\d+(\.\d+)?)$/)
                if (rangeMatch) {
                  const min = parseFloat(rangeMatch[1])
                  const max = parseFloat(rangeMatch[3])
                  if (!isNaN(min) && !isNaN(max)) {
                    return numValue >= min && numValue <= max
                  }
                }

                // Exact match or contains for numeric strings
                const filterNum = parseFloat(filterStr)
                if (!isNaN(filterNum)) {
                  return numValue === filterNum || String(numValue).includes(filterStr)
                }

                return String(numValue).includes(filterStr)
              }
            : 'includesString'
        }
      }),
    [
      columnDefs,
      onForeignKeyClick,
      onForeignKeyOpenTab,
      onColumnStatsClick,
      effectiveMasked,
      tabId,
      toggleColumnMask,
      hoverToPeek,
      sortChips,
      toggleHeaderSort
    ]
  )

  const tableState = React.useMemo(
    () => ({
      globalFilter: filterChips
    }),
    [filterChips]
  )

  const tableInitialState = React.useMemo(
    () => ({
      pagination: { pageSize }
    }),
    [pageSize]
  )

  const tableGlobalFilterFn = React.useCallback((row: any) => globalFilterFn(row), [globalFilterFn])

  const table = useReactTable({
    data: sortedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: tableGlobalFilterFn,
    state: tableState,
    initialState: tableInitialState
  })

  React.useEffect(() => {
    table.setPageIndex(0)
  }, [sortChips, filterChips, table])

  const tableContainerRef = React.useRef<HTMLDivElement>(null)
  const headerRef = React.useRef<HTMLTableRowElement>(null)
  const [columnWidths, setColumnWidths] = React.useState<number[]>([])

  const rows = table.getRowModel().rows
  const shouldVirtualize = rows.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  const columnKey = columnDefs.map((c) => c.name).join(',')

  React.useEffect(() => {
    setColumnWidths([])
  }, [columnKey])

  React.useEffect(() => {
    if (!shouldVirtualize || !headerRef.current) return

    const measureWidths = () => {
      const headerCells = headerRef.current?.querySelectorAll('th')
      if (!headerCells) return
      const widths = Array.from(headerCells, (cell) => cell.offsetWidth)
      // Skip the update when widths haven't changed — otherwise every ResizeObserver
      // tick churns geometry identity and re-renders the overlay layer.
      setColumnWidths((prev) =>
        prev.length === widths.length && prev.every((w, i) => w === widths[i]) ? prev : widths
      )
    }

    const timeoutId = setTimeout(measureWidths, 0)

    const resizeObserver = new ResizeObserver(measureWidths)
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current)
    }

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [shouldVirtualize, columnKey])

  const cellGrid = useCellGrid({
    rows,
    columnDefs,
    columnWidths,
    rowHeight: ROW_HEIGHT,
    // Must match the sticky <TableHeader> row height; drift causes overlay misalignment.
    headerHeight: 40,
    containerRef: tableContainerRef,
    virtualizer,
    enabled: shouldVirtualize
  })

  const diffPlan: KeyingPlan | null = diffOverlay
    ? { strategy: diffOverlay.keyingStrategy, keyColumns: diffOverlay.keyColumns }
    : null

  return (
    <div className="flex flex-col h-full min-h-0">
      <SmartFilterBar
        columns={columnDefs}
        onFilterChange={handleFilterChange}
        onApplyToQuery={onApplyToQuery}
        totalRows={data.length}
        filteredRows={table.getFilteredRowModel().rows.length}
        className="shrink-0"
      />
      <SmartSortBar
        columns={columnDefs}
        chips={sortChips}
        onChipsChange={setSortChips}
        onApplyToQuery={onApplyToQuery}
        className="shrink-0"
      />

      {/* Table with single scroll container */}
      <div className="flex-1 min-h-0 border rounded-lg border-border/50 relative">
        <CellGridInspector
          cellGrid={cellGrid}
          rowCount={rows.length}
          colCount={columnDefs.length}
          onForeignKeyOpen={onForeignKeyClick}
        />
        <div
          ref={tableContainerRef}
          tabIndex={0}
          onClick={cellGrid.handleGridClick}
          className="absolute inset-0 overflow-auto outline-none rounded-lg"
        >
          <table className="w-full min-w-max caption-bottom text-sm">
            <TableHeader className="sticky top-0 bg-muted z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <React.Fragment key={headerGroup.id}>
                  <TableRow ref={headerRef} className="hover:bg-transparent border-border/50">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="h-10 text-xs font-medium text-muted-foreground whitespace-nowrap bg-muted/95 group/head"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                </React.Fragment>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                shouldVirtualize && columnWidths.length > 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: 0 }}>
                      <div
                        role="rowgroup"
                        aria-rowcount={rows.length}
                        style={{
                          height: virtualizer.getTotalSize(),
                          position: 'relative'
                        }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const row = rows[virtualRow.index]
                          return (
                            <div
                              key={row.id}
                              role="row"
                              aria-rowindex={row.index + 1}
                              data-index={virtualRow.index}
                              className="hover:bg-accent/30 border-b border-border/30 transition-colors flex items-center"
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`
                              }}
                            >
                              {row.getVisibleCells().map((cell, cellIndex) => (
                                <div
                                  key={cell.id}
                                  role="cell"
                                  data-cell-row={virtualRow.index}
                                  data-cell-col={cellIndex}
                                  className="py-2 px-4 text-sm whitespace-nowrap overflow-hidden"
                                  style={{
                                    width: columnWidths[cellIndex] || 'auto',
                                    flexShrink: 0
                                  }}
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const rowKey = diffPlan
                      ? deriveRowKey(row.original as Record<string, unknown>, diffPlan, row.index)
                      : null
                    const isAddedRow = !!(rowKey && diffOverlay?.addedRowKeys.has(rowKey))
                    return (
                      <RowContextMenu
                        key={row.id}
                        row={row.original as Record<string, unknown>}
                        columns={columnDefs.map((c) => ({ name: c.name, dataType: c.dataType }))}
                      >
                        <TableRow
                          className="hover:bg-accent/30 border-border/30 transition-colors"
                          style={
                            isAddedRow ? { backgroundColor: 'var(--cell-diff-added)' } : undefined
                          }
                        >
                          {row.getVisibleCells().map((cell, cellIndex) => {
                            const isChangedCell =
                              !isAddedRow &&
                              rowKey !== null &&
                              diffOverlay?.cells.get(
                                cellKey(rowKey, columnDefs[cellIndex]?.name ?? '')
                              )?.kind === 'changed'
                            return (
                              <TableCell
                                key={cell.id}
                                className="py-2 text-sm whitespace-nowrap"
                                style={
                                  isChangedCell
                                    ? { backgroundColor: 'var(--cell-diff-fill)' }
                                    : undefined
                                }
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      </RowContextMenu>
                    )
                  })
                )
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
          <CellGridOverlays cellGrid={cellGrid} />
          <WatchOverlay
            tabId={tabId}
            rows={rows}
            columnDefs={columnDefs}
            geometry={cellGrid.geometry}
            virtualizer={virtualizer}
            enabled={shouldVirtualize && columnWidths.length > 0}
          />
          {diffOverlay && shouldVirtualize && columnWidths.length > 0 && (
            <WatchDecorationOverlay
              diff={diffOverlay}
              rows={rows}
              columnNames={columnDefs.map((c) => c.name)}
              geometry={cellGrid.geometry}
              virtualizer={virtualizer}
              fadeMs={Number.MAX_SAFE_INTEGER}
            />
          )}
        </div>
      </div>

      {/* Pagination */}
      <PaginationControls
        currentPage={table.getState().pagination.pageIndex + 1}
        totalPages={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        totalRows={data.length}
        filteredRows={table.getFilteredRowModel().rows.length}
        onPageChange={(page) => table.setPageIndex(page - 1)}
        onPageSizeChange={(size) => {
          table.setPageSize(size)
          onPageSizeChange?.(size)
        }}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
      />
    </div>
  )
}

/**
 * Lightweight wrapper that subscribes to the watch store for this tab and
 * renders the diff layer. Split out so DataTable doesn't subscribe to the
 * store when the tab isn't being watched.
 */
function WatchOverlay({
  tabId,
  rows,
  columnDefs,
  geometry,
  virtualizer,
  enabled
}: {
  tabId?: string
  rows: ReadonlyArray<{ original: Record<string, unknown> }>
  columnDefs: DataTableColumn[]
  geometry: ReturnType<typeof useCellGrid>['geometry']
  virtualizer: Virtualizer<HTMLDivElement, Element>
  enabled: boolean
}) {
  const watchState = useWatchStore((s) => (tabId ? s.states[tabId] : null))
  if (!enabled || !tabId || !watchState || !watchState.enabled || !watchState.diff) {
    return null
  }
  return (
    <WatchDecorationOverlay
      diff={watchState.diff}
      rows={rows}
      columnNames={columnDefs.map((c) => c.name)}
      geometry={geometry}
      virtualizer={virtualizer}
      fadeMs={watchState.config.fadeMs}
    />
  )
}
