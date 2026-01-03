import { AddRowSheet, type ForeignKeyValue } from '@/components/add-row-sheet'
import { EditToolbar } from '@/components/edit-toolbar'
import { EditableCell } from '@/components/editable-cell'
import { FKCellValue } from '@/components/fk-cell-value'
import { JsonCellValue } from '@/components/json-cell-value'
import { SqlPreviewModal } from '@/components/sql-preview-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { generateLimitClause } from '@/lib/sql-helpers'
import { getTypeColor } from '@/lib/type-colors'
import { cn } from '@/lib/utils'
import { useEditStore } from '@/stores/edit-store'
import { useSettingsStore } from '@/stores/settings-store'
import { PaginationControls } from '@/components/pagination-controls'
import type { ColumnInfo, ConnectionConfig, EditContext, ForeignKeyInfo } from '@data-peek/shared'
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
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Filter,
  Link2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import * as React from 'react'

const VIRTUALIZATION_THRESHOLD = 50
const ROW_HEIGHT = 37

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
  onPageSizeChange?: (size: number) => void
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  /** Called after changes are successfully committed */
  onChangesCommitted?: () => void
  /** Server-side pagination: current page (1-indexed) */
  serverCurrentPage?: number
  /** Server-side pagination: total row count from database */
  serverTotalRowCount?: number | null
  /** Server-side pagination: called when page or pageSize changes */
  onServerPaginationChange?: (page: number, pageSize: number) => void
}

export function EditableDataTable<TData extends Record<string, unknown>>({
  tabId,
  columns: columnDefs,
  data,
  pageSize: propPageSize,
  canEdit = false,
  editContext,
  connection,
  onFiltersChange,
  onSortingChange,
  onPageSizeChange,
  onForeignKeyClick,
  onForeignKeyOpenTab,
  onChangesCommitted,
  serverCurrentPage,
  serverTotalRowCount,
  onServerPaginationChange
}: EditableDataTableProps<TData>) {
  const { defaultPageSize } = useSettingsStore()
  const pageSize = propPageSize ?? defaultPageSize
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = React.useState(false)
  const [showSqlPreview, setShowSqlPreview] = React.useState(false)
  const [sqlStatements, setSqlStatements] = React.useState<
    Array<{ operationId: string; sql: string; type: 'insert' | 'update' | 'delete' }>
  >([])
  const [isCommitting, setIsCommitting] = React.useState(false)

  // Add Row Sheet state
  const [showAddRowSheet, setShowAddRowSheet] = React.useState(false)
  const [duplicateRowValues, setDuplicateRowValues] = React.useState<Record<
    string,
    unknown
  > | null>(null)
  const [foreignKeyValuesMap, setForeignKeyValuesMap] = React.useState<
    Record<string, ForeignKeyValue[]>
  >({})
  const [loadingFkValues, setLoadingFkValues] = React.useState(false)

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
  const hasChanges = pendingChanges.updates + pendingChanges.inserts + pendingChanges.deletes > 0

  // Check for primary key
  const hasPrimaryKey = editContext?.primaryKeyColumns && editContext.primaryKeyColumns.length > 0

  // Ref to store latest handler functions (avoids stale closure in event listeners)
  const keyboardHandlersRef = React.useRef<{
    handleSaveChanges: () => void
    handleDiscardChanges: () => void
    handleToggleEditMode: () => void
    handleAddRowWithSheet: () => void
  }>({
    handleSaveChanges: () => {},
    handleDiscardChanges: () => {},
    handleToggleEditMode: () => {},
    handleAddRowWithSheet: () => {}
  })

  // Keyboard shortcuts for edit mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      const isEditing = tabEdit?.editingCell !== null

      // Cmd+S: Save changes (when in edit mode with pending changes)
      if (isMeta && e.key === 's' && !e.shiftKey) {
        if (isEditMode && hasChanges) {
          e.preventDefault()
          keyboardHandlersRef.current.handleSaveChanges()
          return
        }
      }

      // Escape: Exit edit mode (when not editing a cell)
      if (e.key === 'Escape' && isEditMode && !isEditing) {
        e.preventDefault()
        if (hasChanges) {
          // Has changes - let the toolbar handle the confirmation dialog
          keyboardHandlersRef.current.handleToggleEditMode()
        } else {
          exitEditMode(tabId)
        }
        return
      }

      // Cmd+Shift+A: Add new row (when in edit mode or can edit)
      if (isMeta && e.shiftKey && e.key === 'A') {
        if (canEdit && hasPrimaryKey) {
          e.preventDefault()
          if (!isEditMode && editContext) {
            enterEditMode(tabId, editContext)
          }
          keyboardHandlersRef.current.handleAddRowWithSheet()
          return
        }
      }

      // Cmd+Shift+Z: Discard/revert changes (when in edit mode with pending changes)
      if (isMeta && e.shiftKey && e.key === 'Z') {
        if (isEditMode && hasChanges) {
          e.preventDefault()
          keyboardHandlersRef.current.handleDiscardChanges()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isEditMode,
    hasChanges,
    tabEdit?.editingCell,
    tabId,
    canEdit,
    hasPrimaryKey,
    editContext,
    enterEditMode,
    exitEditMode
  ])

  // Listen for menu events (for menu bar shortcuts)
  React.useEffect(() => {
    const cleanupSave = window.api.menu.onSaveChanges(() => {
      if (isEditMode && hasChanges) {
        keyboardHandlersRef.current.handleSaveChanges()
      }
    })

    const cleanupDiscard = window.api.menu.onDiscardChanges(() => {
      if (isEditMode && hasChanges) {
        keyboardHandlersRef.current.handleDiscardChanges()
      }
    })

    const cleanupAddRow = window.api.menu.onAddRow(() => {
      if (canEdit && hasPrimaryKey) {
        if (!isEditMode && editContext) {
          enterEditMode(tabId, editContext)
        }
        keyboardHandlersRef.current.handleAddRowWithSheet()
      }
    })

    return () => {
      cleanupSave()
      cleanupDiscard()
      cleanupAddRow()
    }
  }, [isEditMode, hasChanges, canEdit, hasPrimaryKey, editContext, tabId, enterEditMode])

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

  // Handle add new row (inline quick add)
  const handleAddRow = () => {
    // Create default values for all columns
    const defaultValues: Record<string, unknown> = {}
    columnDefs.forEach((col) => {
      defaultValues[col.name] = null
    })
    addNewRow(tabId, defaultValues)
  }

  // Handle add row with sheet (form-based)
  const handleAddRowWithSheet = () => {
    setDuplicateRowValues(null)
    setShowAddRowSheet(true)
  }

  // Handle duplicate row
  const handleDuplicateRow = (rowData: Record<string, unknown>) => {
    setDuplicateRowValues(rowData)
    setShowAddRowSheet(true)
  }

  // Handle sheet submit
  const handleSheetSubmit = (values: Record<string, unknown>) => {
    // Enter edit mode if not already in edit mode
    if (!isEditMode && editContext) {
      enterEditMode(tabId, editContext)
    }
    addNewRow(tabId, values)
    setShowAddRowSheet(false)
    setDuplicateRowValues(null)
  }

  // Convert DataTableColumn to ColumnInfo for the sheet
  const columnInfos: ColumnInfo[] = columnDefs.map((col, idx) => ({
    name: col.name,
    dataType: col.dataType,
    isPrimaryKey: col.isPrimaryKey ?? false,
    isNullable: col.isNullable ?? true,
    ordinalPosition: idx + 1,
    foreignKey: col.foreignKey
  }))

  // Build enum values map
  const enumValuesMap: Record<string, string[]> = {}
  columnDefs.forEach((col) => {
    if (col.enumValues && col.enumValues.length > 0) {
      enumValuesMap[col.name] = col.enumValues
    }
  })

  // Fetch FK values when sheet opens
  React.useEffect(() => {
    if (!showAddRowSheet || !connection) return

    // Find columns with foreign keys
    const fkColumns = columnDefs.filter((col) => col.foreignKey)
    if (fkColumns.length === 0) return

    const fetchFkValues = async () => {
      setLoadingFkValues(true)
      const fkValuesMap: Record<string, ForeignKeyValue[]> = {}

      try {
        // Fetch FK values for each column in parallel
        await Promise.all(
          fkColumns.map(async (col) => {
            const fk = col.foreignKey!
            // Query the referenced table - limit to 1000 rows for performance
            // Use TOP for MSSQL, LIMIT for other databases
            const limitClause = generateLimitClause(connection?.dbType, 1000)
            const query =
              connection?.dbType === 'mssql'
                ? `SELECT ${limitClause} DISTINCT "${fk.referencedColumn}" FROM "${fk.referencedSchema}"."${fk.referencedTable}" ORDER BY "${fk.referencedColumn}"`
                : `SELECT DISTINCT "${fk.referencedColumn}" FROM "${fk.referencedSchema}"."${fk.referencedTable}" ORDER BY "${fk.referencedColumn}" ${limitClause}`

            try {
              const result = await window.api.db.query(connection, query)
              if (result.success && Array.isArray(result.data)) {
                fkValuesMap[col.name] = (result.data as Record<string, unknown>[]).map((row) => ({
                  value: row[fk.referencedColumn] as string | number
                }))
              }
            } catch (err) {
              console.error(`Failed to fetch FK values for ${col.name}:`, err)
              fkValuesMap[col.name] = []
            }
          })
        )

        setForeignKeyValuesMap(fkValuesMap)
      } finally {
        setLoadingFkValues(false)
      }
    }

    fetchFkValues()
  }, [showAddRowSheet, connection, columnDefs])

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

  // Update ref with latest handlers (for keyboard shortcuts)
  // Using useLayoutEffect ensures this runs synchronously after render
  React.useLayoutEffect(() => {
    keyboardHandlersRef.current = {
      handleSaveChanges,
      handleDiscardChanges,
      handleToggleEditMode,
      handleAddRowWithSheet
    }
  })

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
          const originalRow = row.original as Record<string, unknown>

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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40">
                    <DropdownMenuItem
                      onClick={() => handleDuplicateRow(originalRow)}
                      className="gap-2"
                    >
                      <Copy className="size-4 text-amber-500" />
                      Duplicate Row
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => markRowForDeletion(tabId, rowIndex, originalRow)}
                      className="gap-2 text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="size-4" />
                      Delete Row
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        },
        size: 40
      })
    }

    // Data columns
    columnDefs.forEach((col, index) => {
      // Generate a stable id for columns - MSSQL can return empty names for aggregates like COUNT(*)
      // TanStack Table requires explicit id when header is a function and accessorKey might be empty
      const columnId = col.name || `_col_${index}`
      const displayName = col.name || `(column ${index + 1})`

      cols.push({
        id: columnId,
        // Keep accessorKey as col.name since that's how row data is keyed (even if empty)
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
  }, [
    isEditMode,
    columnDefs,
    isRowMarkedForDeletion,
    tabId,
    unmarkRowForDeletion,
    markRowForDeletion,
    isCellModified,
    getModifiedCellValue,
    tabEdit?.editingCell?.rowIndex,
    tabEdit?.editingCell?.columnName,
    canEdit,
    startCellEdit,
    updateCellValue,
    cancelCellEdit,
    revertCellChange,
    editContext,
    enterEditMode,
    onForeignKeyClick,
    onForeignKeyOpenTab
  ])

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
      if (headerCells) {
        const widths = Array.from(headerCells).map((cell) => cell.offsetWidth)
        setColumnWidths(widths)
      }
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
                  onAddRowWithSheet={handleAddRowWithSheet}
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
          <div ref={tableContainerRef} className="absolute inset-0 overflow-auto">
            <table className="w-full min-w-max caption-bottom text-sm">
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <React.Fragment key={headerGroup.id}>
                    <TableRow ref={headerRef} className="hover:bg-transparent border-border/50">
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
                            const rowIndex = row.index
                            const isDeleted = isRowMarkedForDeletion(tabId, rowIndex)
                            return (
                              <div
                                key={row.id}
                                role="row"
                                aria-rowindex={rowIndex + 1}
                                data-index={virtualRow.index}
                                className={cn(
                                  'hover:bg-accent/30 border-b border-border/30 transition-colors flex items-center',
                                  isDeleted && 'bg-red-500/5'
                                )}
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
                  )
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}

                {isEditMode &&
                  newRows.map((newRow) => (
                    <TableRow
                      key={newRow.id}
                      className="hover:bg-accent/30 border-border/30 bg-green-500/5"
                    >
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
        {onServerPaginationChange && serverTotalRowCount != null ? (
          // Server-side pagination for table preview tabs
          <PaginationControls
            currentPage={serverCurrentPage ?? 1}
            totalPages={Math.ceil(serverTotalRowCount / pageSize)}
            pageSize={pageSize}
            totalRows={serverTotalRowCount}
            onPageChange={(page) => onServerPaginationChange(page, pageSize)}
            onPageSizeChange={(size) => onServerPaginationChange(1, size)}
            canPreviousPage={(serverCurrentPage ?? 1) > 1}
            canNextPage={(serverCurrentPage ?? 1) < Math.ceil(serverTotalRowCount / pageSize)}
          />
        ) : (
          // Client-side pagination
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
        )}

        {/* SQL Preview Modal */}
        <SqlPreviewModal
          open={showSqlPreview}
          onOpenChange={setShowSqlPreview}
          sqlStatements={sqlStatements}
          onConfirm={handleConfirmCommit}
          isLoading={isCommitting}
        />

        {/* Add Row Sheet */}
        <AddRowSheet
          open={showAddRowSheet}
          onOpenChange={setShowAddRowSheet}
          columns={columnInfos}
          tableName={editContext?.table ?? 'table'}
          schemaName={editContext?.schema}
          initialValues={duplicateRowValues ?? undefined}
          enumValuesMap={enumValuesMap}
          foreignKeyValuesMap={foreignKeyValuesMap}
          loadingFkValues={loadingFkValues}
          onSubmit={handleSheetSubmit}
          isDuplicate={duplicateRowValues !== null}
        />
      </div>
    </TooltipProvider>
  )
}
