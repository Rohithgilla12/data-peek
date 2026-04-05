'use client'

import { Fragment, useMemo, useRef, useState, useCallback, useEffect, memo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  X,
  Copy,
  Check,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from 'lucide-react'
import type { QueryField } from '@shared/index'

const typeColors: Record<string, string> = {
  int4: 'text-blue-400', int8: 'text-blue-400', integer: 'text-blue-400', bigint: 'text-blue-400',
  smallint: 'text-blue-400', serial: 'text-blue-400', numeric: 'text-blue-300', decimal: 'text-blue-300',
  float: 'text-blue-300', double: 'text-blue-300', real: 'text-blue-300',
  text: 'text-green-400', varchar: 'text-green-400', char: 'text-green-400', name: 'text-green-400',
  bool: 'text-yellow-400', boolean: 'text-yellow-400',
  timestamp: 'text-orange-400', timestamptz: 'text-orange-400', date: 'text-orange-400',
  time: 'text-orange-400', datetime: 'text-orange-400',
  json: 'text-amber-400', jsonb: 'text-amber-400',
  uuid: 'text-purple-400',
}

const numericTypes = new Set([
  'int4', 'int8', 'integer', 'bigint', 'smallint', 'serial', 'numeric', 'decimal',
  'float', 'double', 'real', 'int', 'tinyint', 'mediumint', 'money',
])

const VIRTUALIZATION_THRESHOLD = 50
const ROW_HEIGHT = 37

interface ResultsTableProps {
  rows: Record<string, unknown>[]
  fields: QueryField[]
}

const CellValue = memo(function CellValue({ value, dataType }: { value: unknown; dataType: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  if (value === null || value === undefined) {
    return (
      <button onClick={handleCopy} className="text-left text-muted-foreground/50 italic hover:bg-accent/50 px-1 -mx-1 rounded transition-colors">
        NULL
      </button>
    )
  }

  if (typeof value === 'boolean' || dataType === 'bool' || dataType === 'boolean') {
    return (
      <button onClick={handleCopy} className={`text-left font-mono text-xs hover:bg-accent/50 px-1 -mx-1 rounded transition-colors ${value ? 'text-green-400' : 'text-red-400'}`}>
        {String(value)}
      </button>
    )
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    const preview = json.length > 50 ? json.slice(0, 50) + '...' : json
    return (
      <button onClick={handleCopy} className="text-left text-amber-400 hover:bg-accent/50 px-1 -mx-1 rounded transition-colors truncate max-w-[300px]" title={json.slice(0, 500)}>
        {preview}
      </button>
    )
  }

  const str = String(value)
  const isLong = str.length > 50
  const isMono =
    dataType.includes('uuid') ||
    dataType.includes('int') ||
    dataType.includes('numeric') ||
    dataType.includes('decimal') ||
    dataType.includes('float') ||
    dataType.includes('double') ||
    dataType.includes('money')

  return (
    <button
      onClick={handleCopy}
      className={`text-left truncate max-w-[300px] hover:bg-accent/50 px-1 -mx-1 rounded transition-colors ${isMono ? 'font-mono text-xs' : ''}`}
      title={isLong ? str.slice(0, 500) : undefined}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="size-3" /> Copied!
        </span>
      ) : (
        isLong ? str.slice(0, 50) + '...' : str
      )}
    </button>
  )
})

export function ResultsTable({ rows, fields }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = useState(false)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLTableRowElement>(null)
  const [columnWidths, setColumnWidths] = useState<number[]>([])

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      fields.map((field, index) => {
        const columnId = field.name || `_col_${index}`
        const lowerType = field.dataType.toLowerCase()
        const isNumeric = numericTypes.has(lowerType)

        return {
          id: columnId,
          accessorKey: field.name,
          header: ({ column }) => {
            const isSorted = column.getIsSorted()
            const typeColor = typeColors[field.dataType] ?? 'text-muted-foreground'
            return (
              <div className="flex items-center">
                <button
                  className="h-auto py-1 px-2 -mx-2 font-medium hover:bg-accent/50 rounded flex items-center gap-1 flex-1 transition-colors"
                  onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                >
                  <span>{field.name || `(column ${index + 1})`}</span>
                  <span className={`text-[9px] px-1 py-0 font-mono border border-current/20 rounded ${typeColor}`}>
                    {field.dataType}
                  </span>
                  {isSorted === 'asc' ? (
                    <ArrowUp className="ml-auto size-3 text-accent" />
                  ) : isSorted === 'desc' ? (
                    <ArrowDown className="ml-auto size-3 text-accent" />
                  ) : (
                    <ArrowUpDown className="ml-auto size-3 opacity-30" />
                  )}
                </button>
              </div>
            )
          },
          cell: ({ getValue }) => <CellValue value={getValue()} dataType={field.dataType} />,
          filterFn: isNumeric
            ? (row: Row<Record<string, unknown>>, columnId: string, filterValue: unknown) => {
                const value = row.getValue(columnId)
                if (value === null || value === undefined) return false
                const numValue = Number(value)
                const filterStr = String(filterValue).trim()
                if (filterStr.startsWith('>=')) return numValue >= parseFloat(filterStr.slice(2))
                if (filterStr.startsWith('<=')) return numValue <= parseFloat(filterStr.slice(2))
                if (filterStr.startsWith('>')) return numValue > parseFloat(filterStr.slice(1))
                if (filterStr.startsWith('<')) return numValue < parseFloat(filterStr.slice(1))
                const rangeMatch = filterStr.match(/^(-?\d+(\.\d+)?)\s*-\s*(-?\d+(\.\d+)?)$/)
                if (rangeMatch) return numValue >= parseFloat(rangeMatch[1]) && numValue <= parseFloat(rangeMatch[3])
                return String(numValue).includes(filterStr)
              }
            : 'includesString',
        }
      }),
    [fields]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize: 100 } },
  })

  const activeFilterCount = columnFilters.filter((f) => f.value !== '').length
  const tableRows = table.getRowModel().rows
  const shouldVirtualize = tableRows.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const columnKey = fields.map((c) => c.name).join(',')

  useEffect(() => {
    setColumnWidths([])
  }, [columnKey])

  useEffect(() => {
    if (!shouldVirtualize || !headerRef.current) return

    const measureWidths = () => {
      const headerCells = headerRef.current?.querySelectorAll('th')
      if (headerCells) {
        setColumnWidths(Array.from(headerCells).map((cell) => cell.offsetWidth))
      }
    }

    const timeoutId = setTimeout(measureWidths, 0)
    const resizeObserver = new ResizeObserver(measureWidths)
    if (headerRef.current) resizeObserver.observe(headerRef.current)

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [shouldVirtualize, columnKey])

  if (fields.length === 0) return null

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Filter toggle bar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              showFilters ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <Filter className="size-3" />
            Filter
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent ml-0.5">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setColumnFilters([])}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" />
              Clear all
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length !== rows.length
            ? `${table.getFilteredRowModel().rows.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`
            : `${rows.length.toLocaleString()} rows`}
        </div>
      </div>

      {/* Table container */}
      <div className="flex-1 min-h-0 border-b border-border/50 relative">
        <div ref={tableContainerRef} className="absolute inset-0 overflow-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  <tr ref={headerRef} className="border-b border-border/50">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="h-10 text-xs font-medium text-muted-foreground whitespace-nowrap bg-muted/95 px-4"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                  {showFilters && (
                    <tr className="border-b border-border/50 bg-muted/80">
                      {headerGroup.headers.map((header) => (
                        <th key={`filter-${header.id}`} className="h-9 py-1 px-2 bg-muted/80">
                          {header.column.getCanFilter() ? (
                            <input
                              placeholder="Filter..."
                              value={(header.column.getFilterValue() as string) ?? ''}
                              onChange={(e) => header.column.setFilterValue(e.target.value || undefined)}
                              className="h-7 w-full rounded-md border border-border bg-background/80 px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  )}
                </Fragment>
              ))}
            </thead>
            <tbody>
              {tableRows.length ? (
                shouldVirtualize && columnWidths.length > 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: 0 }}>
                      <div
                        role="rowgroup"
                        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const row = tableRows[virtualRow.index]
                          return (
                            <div
                              key={row.id}
                              role="row"
                              className="hover:bg-accent/30 border-b border-border/30 transition-colors flex items-center"
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                              {row.getVisibleCells().map((cell, cellIndex) => {
                                const meta = cell.column.columnDef.meta as { dataType?: string } | undefined
                                const isNum = meta?.dataType ? numericTypes.has(meta.dataType) : false
                                return (
                                  <div
                                    key={cell.id}
                                    role="cell"
                                    className={`py-2 px-4 text-sm whitespace-nowrap overflow-hidden ${isNum ? 'text-right' : ''}`}
                                    style={{ width: columnWidths[cellIndex] || 'auto', flexShrink: 0 }}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr key={row.id} className="hover:bg-accent/30 border-b border-border/30 transition-colors">
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as { dataType?: string } | undefined
                        const isNum = meta?.dataType ? numericTypes.has(meta.dataType) : false
                        return (
                          <td key={cell.id} className={`py-2 px-4 text-sm whitespace-nowrap ${isNum ? 'text-right' : ''}`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 text-xs text-muted-foreground">
        <span>
          Rows {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{' '}
          of {table.getFilteredRowModel().rows.length.toLocaleString()}
          {table.getFilteredRowModel().rows.length !== rows.length &&
            ` (filtered from ${rows.length.toLocaleString()})`}
        </span>

        <div className="flex items-center gap-3">
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-border bg-input px-2 py-0.5 text-xs text-foreground"
          >
            {[25, 50, 100, 250, 500].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="flex items-center gap-0.5">
            <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} className="rounded p-1 hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronsLeft className="size-3.5" />
            </button>
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rounded p-1 hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="px-2 tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rounded p-1 hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronRight className="size-3.5" />
            </button>
            <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} className="rounded p-1 hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronsRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
