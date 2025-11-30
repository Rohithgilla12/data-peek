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
  Trash2,
  RotateCcw,
  Link2
} from 'lucide-react'
import type { ForeignKeyInfo, ColumnInfo, EditContext, ConnectionConfig } from '@data-peek/shared'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EditableCell } from '@/components/editable-cell'
import { EditToolbar } from '@/components/edit-toolbar'
import { SqlPreviewModal } from '@/components/sql-preview-modal'
import { JsonCellValue } from '@/components/json-cell-value'
import { FKCellValue } from '@/components/fk-cell-value'
import { useEditStore } from '@/stores/edit-store'

export interface DataTableColumn {
  name: string
  dataType: string
  foreignKey?: ForeignKeyInfo
  isPrimaryKey?: boolean
  isNullable?: boolean
  enumValues?: string[]
}

export interface DataTableFilter {
  column: string
  value: string
}

export interface DataTableSort {
  column: string
  direction: 'asc' | 'desc'
}

interface EditableDataTableProps<TData> {
  tabId: string
  columns: DataTableColumn[]
  data: TData[]
  pageSize?: number
  /** Whether this table can be edited (table-preview only) */
  canEdit?: boolean
  /** Edit context for building SQL */
  editContext?: EditContext | null
  /** Connection for executing edits */
  connection?: ConnectionConfig | null
  onFiltersChange?: (filters: DataTableFilter[]) => void
  onSortingChange?: (sorting: DataTableSort[]) => void
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  /** Called after changes are successfully committed */
  onChangesCommitted?: () => void
}

function getTypeColor(type: string): string {
  const lower = type.toLowerCase()
  if (lower.includes('uuid')) return 'text-purple-400'
  if (lower.includes('varchar') || lower.includes('text') || lower.includes('char'))
    return 'text-green-400'
  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('bigint')
  )
    return 'text-blue-400'
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time'))
    return 'text-orange-400'
  if (lower.includes('bool')) return 'text-yellow-400'
  return 'text-muted-foreground'
}

export function EditableDataTable<TData extends Record<string, unknown>>({
  tabId,
  columns: columnDefs,
  data,
  pageSize = 50,
  canEdit = false,
  editContext,
  connection,
  onFiltersChange,
  onSortingChange,
  onForeignKeyClick,
  onForeignKeyOpenTab,
  onChangesCommitted
}: EditableDataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = React.useState(false)
  const [showSqlPreview, setShowSqlPreview] = React.useState(false)
  const [sqlStatements, setSqlStatements] = React.useState<
    Array<{ operationId: string; sql: string; type: 'insert' | 'update' | 'delete' }>
  >([])
  const [isCommitting, setIsCommitting] = React.useState(false)

  // Edit store
  const {
    isInEditMode,
    enterEditMode,
    exitEditMode,
    startCellEdit,
    cancelCellEdit,
    updateCellValue,
    getModifiedCellValue,
    isCellModified,
    markRowForDeletion,
    unmarkRowForDeletion,
    isRowMarkedForDeletion,
    addNewRow,
    updateNewRowValue,
    removeNewRow,
    getNewRows,
    revertCellChange,
    revertAllChanges,
    buildEditBatch,
    getPendingChangesCount,
    clearPendingChanges
  } = useEditStore()

  const tabEdit = useEditStore((s) => s.tabEdits.get(tabId))
  const isEditMode = isInEditMode(tabId)
  const pendingChanges = getPendingChangesCount(tabId)
  const newRows = getNewRows(tabId)

  // Check for primary key
  const hasPrimaryKey = editContext?.primaryKeyColumns && editContext.primaryKeyColumns.length > 0

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

  // Handle toggle edit mode
  const handleToggleEditMode = () => {
    if (isEditMode) {
      exitEditMode(tabId)
    } else if (editContext) {
      enterEditMode(tabId, editContext)
    }
  }

  // Handle add new row
  const handleAddRow = () => {
    // Create default values for all columns
    const defaultValues: Record<string, unknown> = {}
    columnDefs.forEach((col) => {
      defaultValues[col.name] = null
    })
    addNewRow(tabId, defaultValues)
  }

  // Handle preview SQL
  const handlePreviewSql = async () => {
    const columnInfos: ColumnInfo[] = columnDefs.map((col) => ({
      name: col.name,
      dataType: col.dataType,
      isPrimaryKey: col.isPrimaryKey ?? false,
      isNullable: col.isNullable ?? true,
      ordinalPosition: 0
    }))

    const batch = buildEditBatch(tabId, columnInfos)
    if (!batch) return

    try {
      const response = await window.api.db.previewSql(batch)
      if (response.success && response.data) {
        const statements = response.data.map((preview) => {
          const op = batch.operations.find((o) => o.id === preview.operationId)
          return {
            operationId: preview.operationId,
            sql: preview.sql,
            type: op?.type ?? 'update'
          }
        }) as Array<{ operationId: string; sql: string; type: 'insert' | 'update' | 'delete' }>
        setSqlStatements(statements)
        setShowSqlPreview(true)
      }
    } catch (error) {
      console.error('Failed to generate SQL preview:', error)
    }
  }

  // Handle save changes
  const handleSaveChanges = async () => {
    await handlePreviewSql()
  }

  // Handle confirm commit
  const handleConfirmCommit = async () => {
    if (!connection) return

    const columnInfos: ColumnInfo[] = columnDefs.map((col) => ({
      name: col.name,
      dataType: col.dataType,
      isPrimaryKey: col.isPrimaryKey ?? false,
      isNullable: col.isNullable ?? true,
      ordinalPosition: 0
    }))

    const batch = buildEditBatch(tabId, columnInfos)
    if (!batch) return

    setIsCommitting(true)

    try {
      const response = await window.api.db.execute(connection, batch)

      if (response.success && response.data?.success) {
        // Clear pending changes
        clearPendingChanges(tabId)
        setShowSqlPreview(false)
        // Notify parent to refresh data
        onChangesCommitted?.()
      } else {
        // Handle errors
        const errorMsg =
          response.data?.errors?.[0]?.message || response.error || 'Failed to save changes'
        console.error('Commit failed:', errorMsg)
        // Could show a toast notification here
      }
    } catch (error) {
      console.error('Commit error:', error)
    } finally {
      setIsCommitting(false)
    }
  }

  // Handle discard changes
  const handleDiscardChanges = () => {
    revertAllChanges(tabId)
  }

  // Build table columns
  const columns = React.useMemo<ColumnDef<TData>[]>(() => {
    const cols: ColumnDef<TData>[] = []

    // Row selection/delete column in edit mode
    if (isEditMode) {
      cols.push({
        id: '_select',
        header: () => null,
        cell: ({ row }) => {
          const rowIndex = row.index
          const isDeleted = isRowMarkedForDeletion(tabId, rowIndex)
          const originalRow = row.original

          return (
            <div className="flex items-center gap-1">
              {isDeleted ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => unmarkRowForDeletion(tabId, rowIndex)}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restore row</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-red-500"
                      onClick={() =>
                        markRowForDeletion(tabId, rowIndex, originalRow as Record<string, unknown>)
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete row</TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        },
        size: 40
      })
    }

    // Data columns
    columnDefs.forEach((col) => {
      cols.push({
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
                <span>{col.name}</span>
                {col.isPrimaryKey && (
                  <span className="ml-1 text-amber-500" title="Primary Key">
                    🔑
                  </span>
                )}
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
        cell: ({ row, getValue }) => {
          const rowIndex = row.index
          const value = getValue()
          const isDeleted = isRowMarkedForDeletion(tabId, rowIndex)
          const isModified = isCellModified(tabId, rowIndex, col.name)
          const modifiedValue = getModifiedCellValue(tabId, rowIndex, col.name)
          const displayValue = isModified ? modifiedValue : value
          const originalRow = row.original as Record<string, unknown>
          const isEditing =
            tabEdit?.editingCell?.rowIndex === rowIndex &&
            tabEdit?.editingCell?.columnName === col.name

          if (isEditMode) {
            return (
              <EditableCell
                value={displayValue}
                originalValue={value}
                dataType={col.dataType}
                isEditing={isEditing}
                isModified={isModified}
                isDeleted={isDeleted}
                enumValues={col.enumValues}
                columnName={col.name}
                onStartEdit={() => startCellEdit(tabId, rowIndex, col.name)}
                onSave={(newValue) =>
                  updateCellValue(tabId, rowIndex, col.name, newValue, originalRow)
                }
                onCancel={() => cancelCellEdit(tabId)}
                onRevert={
                  isModified ? () => revertCellChange(tabId, rowIndex, col.name) : undefined
                }
              />
            )
          }

          // Non-edit mode rendering
          // Single-click to enter edit mode for simple cells
          // Double-click for cells with special interactive elements (JSON viewer, FK navigation)
          const handleActivate = () => {
            if (!canEdit || !editContext) return
            enterEditMode(tabId, editContext)
            setTimeout(() => startCellEdit(tabId, rowIndex, col.name), 0)
          }

          if (value === null || value === undefined) {
            return (
              <span
                className={cn(
                  'text-muted-foreground/50 italic px-1 py-0.5 rounded',
                  canEdit && 'cursor-pointer hover:bg-accent/50'
                )}
                onClick={handleActivate}
              >
                NULL
              </span>
            )
          }

          // Handle JSON/JSONB types specially
          // Single-click opens viewer, double-click on cell background enters edit mode
          const lowerType = col.dataType.toLowerCase()
          if (lowerType.includes('json')) {
            return (
              <div
                onDoubleClick={handleActivate}
                className={cn('flex items-center', canEdit && 'cursor-pointer')}
                title={canEdit ? 'Double-click to edit' : undefined}
              >
                <JsonCellValue value={value} columnName={col.name} />
              </div>
            )
          }

          // Handle Foreign Key columns
          // Single-click navigates, double-click on cell background enters edit mode
          if (col.foreignKey) {
            return (
              <div
                onDoubleClick={handleActivate}
                className={cn('flex items-center', canEdit && 'cursor-pointer')}
                title={canEdit ? 'Double-click to edit' : undefined}
              >
                <FKCellValue
                  value={value}
                  foreignKey={col.foreignKey}
                  onForeignKeyClick={onForeignKeyClick}
                  onForeignKeyOpenTab={onForeignKeyOpenTab}
                />
              </div>
            )
          }

          const stringValue = String(value)
          const isLong = stringValue.length > 50

          return (
            <span
              className={cn(
                'truncate max-w-[300px] block px-1 py-0.5 rounded',
                canEdit && 'cursor-pointer hover:bg-accent/50'
              )}
              onClick={handleActivate}
            >
              {isLong ? stringValue.substring(0, 50) + '...' : stringValue}
            </span>
          )
        },
        filterFn: 'includesString'
      })
    })

    return cols
  }, [columnDefs, isEditMode, tabId, tabEdit, onForeignKeyClick, onForeignKeyOpenTab, canEdit, editContext, enterEditMode, startCellEdit])

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
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar Row */}
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

            {canEdit && (
              <>
                <div className="h-4 w-px bg-border mx-1" />
                <EditToolbar
                  isEditMode={isEditMode}
                  canEdit={canEdit}
                  noPrimaryKey={!hasPrimaryKey}
                  pendingChanges={pendingChanges}
                  isCommitting={isCommitting}
                  onToggleEditMode={handleToggleEditMode}
                  onAddRow={handleAddRow}
                  onSaveChanges={handleSaveChanges}
                  onDiscardChanges={handleDiscardChanges}
                  onPreviewSql={handlePreviewSql}
                />
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} of {data.length} rows
            {newRows.length > 0 && (
              <span className="text-green-500 ml-2">+{newRows.length} new</span>
            )}
          </div>
        </div>

        {/* Table */}
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
                          style={{ width: header.column.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                    {showFilters && (
                      <TableRow className="hover:bg-transparent border-border/50 bg-muted/80">
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={`filter-${header.id}`}
                            className="h-9 py-1 px-2 bg-muted/80"
                          >
                            {header.column.getCanFilter() && header.id !== '_select' ? (
                              <Input
                                placeholder="Filter..."
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
                {/* Existing rows */}
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => {
                    const rowIndex = row.index
                    const isDeleted = isRowMarkedForDeletion(tabId, rowIndex)

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'hover:bg-accent/30 border-border/30 transition-colors',
                          isDeleted && 'bg-red-500/5'
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="py-2 text-sm whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}

                {/* New rows (in edit mode) */}
                {isEditMode &&
                  newRows.map((newRow) => (
                    <TableRow
                      key={newRow.id}
                      className="hover:bg-accent/30 border-border/30 bg-green-500/5"
                    >
                      {/* Delete button for new row */}
                      <TableCell className="py-2 text-sm whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-red-500"
                          onClick={() => removeNewRow(tabId, newRow.id)}
                        >
                          <X className="size-3" />
                        </Button>
                      </TableCell>
                      {/* Data cells */}
                      {columnDefs.map((col) => (
                        <TableCell key={col.name} className="py-2 text-sm whitespace-nowrap">
                          <EditableCell
                            value={newRow.values[col.name]}
                            originalValue={null}
                            dataType={col.dataType}
                            isEditing={false}
                            isModified={false}
                            isNewRow={true}
                            enumValues={col.enumValues}
                            columnName={col.name}
                            onStartEdit={() => {}}
                            onSave={(value) => updateNewRowValue(tabId, newRow.id, col.name, value)}
                            onCancel={() => {}}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
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

        {/* SQL Preview Modal */}
        <SqlPreviewModal
          open={showSqlPreview}
          onOpenChange={setShowSqlPreview}
          sqlStatements={sqlStatements}
          onConfirm={handleConfirmCommit}
          isLoading={isCommitting}
        />
      </div>
    </TooltipProvider>
  )
}
