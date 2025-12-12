'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  X,
  Link2,
  Copy
} from 'lucide-react'
import type { ForeignKeyInfo } from '@data-peek/shared'
import { Input } from '@/components/ui/input'

import { Button } from '@/components/ui/button'
import { JsonCellValue } from '@/components/json-cell-value'
import { FKCellValue } from '@/components/fk-cell-value'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getTypeColor } from '@/lib/type-colors'

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
  columns: DataTableColumn[]
  data: TData[]
  pageSize?: number
  onFiltersChange?: (filters: DataTableFilter[]) => void
  onSortingChange?: (sorting: DataTableSort[]) => void
  /** Called when user clicks a FK cell (opens panel) */
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  /** Called when user Cmd+clicks a FK cell (opens new tab) */
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
}

function CellValue({
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

  const stringValue = String(value)
  const isLong = stringValue.length > 50
  const isMono = lowerType.includes('uuid') || lowerType.includes('int')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
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
}

export function DataTable<TData extends Record<string, unknown>>({
  columns: columnDefs,
  data,
  pageSize = 50,
  onFiltersChange,
  onSortingChange,
  onForeignKeyClick,
  onForeignKeyOpenTab
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = React.useState(false)

  // Notify parent of filter changes
  React.useEffect(() => {
    if (onFiltersChange) {
      const filters: DataTableFilter[] = columnFilters
        .filter((f) => f.value !== '')
        .map((f) => ({
          column: f.id,
          value: String(f.value)
        }))
      onFiltersChange(filters)
    }
  }, [columnFilters, onFiltersChange])

  // Notify parent of sorting changes
  React.useEffect(() => {
    if (onSortingChange) {
      const sorts: DataTableSort[] = sorting.map((s) => ({
        column: s.id,
        direction: s.desc ? 'desc' : 'asc'
      }))
      onSortingChange(sorts)
    }
  }, [sorting, onSortingChange])

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
          header: ({ column }) => {
            const isSorted = column.getIsSorted()
            return (
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  className="h-auto py-1 px-2 -mx-2 font-medium hover:bg-accent/50"
                  onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                >
                  <span>{displayName}</span>
                  {col.foreignKey && <Link2 className="ml-1 size-3 text-blue-400" />}
                  <Badge
                    variant="outline"
                    className={`ml-1.5 text-[9px] px-1 py-0 font-mono ${getTypeColor(col.dataType)}`}
                  >
                    {col.dataType}
                  </Badge>
                  {isSorted === 'asc' ? (
                    <ArrowUp className="ml-1 size-3 text-primary" />
                  ) : isSorted === 'desc' ? (
                    <ArrowDown className="ml-1 size-3 text-primary" />
                  ) : (
                    <ArrowUpDown className="ml-1 size-3 opacity-50" />
                  )}
                </Button>
                {col.foreignKey && (
                  <span className="text-[9px] text-muted-foreground px-2 -mt-0.5">
                    → {col.foreignKey.referencedTable}
                  </span>
                )}
              </div>
            )
          },
          cell: ({ getValue }) => (
            <CellValue
              value={getValue()}
              dataType={col.dataType}
              columnName={col.name}
              foreignKey={col.foreignKey}
              onForeignKeyClick={onForeignKeyClick}
              onForeignKeyOpenTab={onForeignKeyOpenTab}
            />
          ),
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
    [columnDefs, onForeignKeyClick, onForeignKeyOpenTab]
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters
    },
    initialState: {
      pagination: {
        pageSize
      }
    }
  })

  const activeFilterCount = columnFilters.filter((f) => f.value !== '').length

  const clearAllFilters = () => {
    setColumnFilters([])
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter Toggle Bar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="size-3" />
            Filter
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={clearAllFilters}
            >
              <X className="size-3" />
              Clear all
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} of {data.length} rows
        </div>
      </div>

      {/* Table with single scroll container */}
      <div className="flex-1 min-h-0 border rounded-lg border-border/50 relative">
        <div className="absolute inset-0 overflow-auto">
          <table className="w-full min-w-max caption-bottom text-sm">
            <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <React.Fragment key={headerGroup.id}>
                  <TableRow className="hover:bg-transparent border-border/50">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="h-10 text-xs font-medium text-muted-foreground whitespace-nowrap bg-muted/95"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                  {/* Filter Row */}
                  {showFilters && (
                    <TableRow className="hover:bg-transparent border-border/50 bg-muted/80">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={`filter-${header.id}`}
                          className="h-9 py-1 px-2 bg-muted/80"
                        >
                          {header.column.getCanFilter() ? (
                            <Input
                              placeholder={`Filter...`}
                              value={(header.column.getFilterValue() as string) ?? ''}
                              onChange={(e) => header.column.setFilterValue(e.target.value)}
                              className="h-7 text-xs bg-background/80"
                            />
                          ) : null}
                        </TableHead>
                      ))}
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-accent/30 border-border/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2 text-sm whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-2 shrink-0">
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s) total
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
