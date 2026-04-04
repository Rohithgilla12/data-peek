'use client'

import { Fragment, useMemo, useRef, useState, useCallback } from 'react'
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
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Check } from 'lucide-react'
import type { QueryField } from '@shared/index'

const typeColors: Record<string, string> = {
  int4: 'text-blue-400',
  int8: 'text-blue-400',
  integer: 'text-blue-400',
  bigint: 'text-blue-400',
  smallint: 'text-blue-400',
  serial: 'text-blue-400',
  numeric: 'text-blue-300',
  decimal: 'text-blue-300',
  float: 'text-blue-300',
  double: 'text-blue-300',
  real: 'text-blue-300',
  text: 'text-green-400',
  varchar: 'text-green-400',
  char: 'text-green-400',
  name: 'text-green-400',
  bool: 'text-yellow-400',
  boolean: 'text-yellow-400',
  timestamp: 'text-orange-400',
  timestamptz: 'text-orange-400',
  date: 'text-orange-400',
  time: 'text-orange-400',
  datetime: 'text-orange-400',
  json: 'text-amber-400',
  jsonb: 'text-amber-400',
  uuid: 'text-purple-400',
}

const numericTypes = new Set([
  'int4',
  'int8',
  'integer',
  'bigint',
  'smallint',
  'serial',
  'numeric',
  'decimal',
  'float',
  'double',
  'real',
  'int',
  'tinyint',
  'mediumint',
])

interface ResultsTableProps {
  rows: Record<string, unknown>[]
  fields: QueryField[]
}

function CellValue({ value, dataType }: { value: unknown; dataType: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text =
      value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  if (value === null || value === undefined) {
    return (
      <span
        className="italic text-muted-foreground/50 cursor-pointer hover:text-muted-foreground/70 transition-colors"
        onClick={handleCopy}
        title="Click to copy"
      >
        NULL
      </span>
    )
  }

  if (typeof value === 'boolean' || dataType === 'bool' || dataType === 'boolean') {
    return (
      <span
        className={`cursor-pointer ${value ? 'text-green-400' : 'text-red-400'}`}
        onClick={handleCopy}
        title="Click to copy"
      >
        {String(value)}
      </span>
    )
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    const preview = json.length > 50 ? json.slice(0, 50) + '...' : json
    return (
      <span
        className="text-amber-400 cursor-pointer hover:text-amber-300 transition-colors"
        onClick={handleCopy}
        title={`Click to copy\n${json.slice(0, 200)}`}
      >
        {preview}
      </span>
    )
  }

  const str = String(value)
  const isNumeric = numericTypes.has(dataType)
  const truncated = str.length > 80 ? str.slice(0, 80) + '...' : str

  return (
    <span
      className={`cursor-pointer hover:text-accent/80 transition-colors ${isNumeric ? 'tabular-nums' : ''} ${copied ? 'text-success' : ''}`}
      onClick={handleCopy}
      title={str.length > 80 ? `Click to copy\n${str.slice(0, 500)}` : 'Click to copy'}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> Copied!
        </span>
      ) : (
        truncated
      )}
    </span>
  )
}

export function ResultsTable({ rows, fields }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = useState(false)
  const [pageSize, setPageSize] = useState(100)
  const parentRef = useRef<HTMLDivElement>(null)

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      fields.map((field) => ({
        accessorKey: field.name,
        header: field.name,
        cell: ({ getValue }) => <CellValue value={getValue()} dataType={field.dataType} />,
        size: Math.max(100, Math.min(300, field.name.length * 9 + 60)),
        filterFn: 'includesString',
        meta: { dataType: field.dataType },
      })),
    [fields]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const { rows: tableRows } = table.getRowModel()
  const useVirtual = tableRows.length > 50

  const virtualizer = useVirtualizer({
    count: useVirtual ? tableRows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 33,
    overscan: 15,
    enabled: useVirtual,
  })

  const activeFilterCount = columnFilters.filter((f) => f.value).length
  const totalFiltered = table.getFilteredRowModel().rows.length
  const totalRows = rows.length
  const pageCount = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex

  if (fields.length === 0) return null

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-1 border-b border-border text-xs shrink-0">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
            showFilters
              ? 'bg-accent/10 text-accent'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Filter className="h-3 w-3" />
          Filter
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            onClick={() => setColumnFilters([])}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-2.5 w-2.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground">
            {totalFiltered !== totalRows
              ? `${totalFiltered.toLocaleString()} of ${totalRows.toLocaleString()} rows`
              : `${totalRows.toLocaleString()} rows`}
          </span>

          {pageCount > 1 && (
            <>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => {
                  const size = Number(e.target.value)
                  setPageSize(size)
                  table.setPageSize(size)
                }}
                className="rounded border border-border bg-input px-1.5 py-0.5 text-[10px] text-foreground"
              >
                {[25, 50, 100, 250, 500].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ««
                </button>
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  «
                </button>
                <span className="px-1 text-muted-foreground">
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  »
                </button>
                <button
                  onClick={() => table.setPageIndex(pageCount - 1)}
                  disabled={!table.getCanNextPage()}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  »»
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs font-mono">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <Fragment key={hg.id}>
                <tr>
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    const meta = header.column.columnDef.meta as
                      | { dataType: string }
                      | undefined
                    const typeColor = meta?.dataType
                      ? (typeColors[meta.dataType] ?? 'text-muted-foreground')
                      : 'text-muted-foreground'
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="cursor-pointer select-none whitespace-nowrap border-b border-border bg-background px-3 py-1.5 text-left font-medium text-foreground hover:bg-muted/50 transition-colors"
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          <span className={`text-[9px] font-normal ${typeColor}`}>
                            {meta?.dataType}
                          </span>
                          <span className="ml-auto flex-shrink-0">
                            {sorted === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-accent" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="h-3 w-3 text-accent" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-muted-foreground/30" />
                            )}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
                {showFilters && (
                  <tr>
                    {hg.headers.map((header) => (
                      <th
                        key={`filter-${header.id}`}
                        className="border-b border-border bg-background/80 px-1 py-1"
                      >
                        <input
                          type="text"
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={(e) =>
                            header.column.setFilterValue(e.target.value || undefined)
                          }
                          placeholder="Filter..."
                          className="w-full rounded border border-border/50 bg-input px-2 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring font-sans"
                        />
                      </th>
                    ))}
                  </tr>
                )}
              </Fragment>
            ))}
          </thead>
          <tbody>
            {useVirtual ? (
              <>
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: virtualizer.getVirtualItems()[0].start }}
                    />
                  </tr>
                )}
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index]
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/20 hover:bg-accent/5 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as
                          | { dataType: string }
                          | undefined
                        const isNum = meta?.dataType ? numericTypes.has(meta.dataType) : false
                        return (
                          <td
                            key={cell.id}
                            className={`whitespace-nowrap px-3 py-1 text-foreground max-w-xs truncate ${isNum ? 'text-right' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{
                        height:
                          virtualizer.getTotalSize() -
                          (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                      }}
                    />
                  </tr>
                )}
              </>
            ) : (
              tableRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/20 hover:bg-accent/5 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { dataType: string } | undefined
                    const isNum = meta?.dataType ? numericTypes.has(meta.dataType) : false
                    return (
                      <td
                        key={cell.id}
                        className={`whitespace-nowrap px-3 py-1 text-foreground max-w-xs truncate ${isNum ? 'text-right' : ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
