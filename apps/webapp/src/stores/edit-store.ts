import { create } from 'zustand'
import type {
  EditOperation,
  RowUpdate,
  RowInsert,
  RowDelete,
  EditContext,
  EditBatch,
  CellChange,
  PrimaryKeyValue,
  ColumnInfo
} from '@data-peek/shared'

/**
 * Edit mode state per tab
 */
interface TabEditState {
  /** Whether edit mode is active for this tab */
  isEditMode: boolean
  /** Edit context (schema, table, pk columns) */
  context: EditContext | null
  /** Pending operations */
  operations: EditOperation[]
  /** Currently editing cell */
  editingCell: { rowIndex: number; columnName: string } | null
  /** Rows marked for deletion (by their index in the result set) */
  deletedRowIndices: Set<number>
  /** New rows being added (not yet in database) */
  newRows: Array<{ id: string; values: Record<string, unknown> }>
  /** Original row data for modified rows (key: row index) */
  originalRows: Map<number, Record<string, unknown>>
  /** Modified cell values (key: `${rowIndex}:${columnName}`) */
  modifiedCells: Map<string, unknown>
}

interface EditStoreState {
  /** Edit state per tab (key: tabId) */
  tabEdits: Map<string, TabEditState>

  /** Actions */
  // Edit mode management
  enterEditMode: (tabId: string, context: EditContext) => void
  exitEditMode: (tabId: string) => void
  isInEditMode: (tabId: string) => boolean
  getEditContext: (tabId: string) => EditContext | null

  // Cell editing
  startCellEdit: (tabId: string, rowIndex: number, columnName: string) => void
  cancelCellEdit: (tabId: string) => void
  updateCellValue: (
    tabId: string,
    rowIndex: number,
    columnName: string,
    value: unknown,
    originalRow: Record<string, unknown>
  ) => void
  getModifiedCellValue: (tabId: string, rowIndex: number, columnName: string) => unknown | undefined
  isCellModified: (tabId: string, rowIndex: number, columnName: string) => boolean

  // Row operations
  markRowForDeletion: (
    tabId: string,
    rowIndex: number,
    originalRow: Record<string, unknown>
  ) => void
  unmarkRowForDeletion: (tabId: string, rowIndex: number) => void
  isRowMarkedForDeletion: (tabId: string, rowIndex: number) => boolean
  addNewRow: (tabId: string, defaultValues: Record<string, unknown>) => string
  updateNewRowValue: (tabId: string, rowId: string, columnName: string, value: unknown) => void
  removeNewRow: (tabId: string, rowId: string) => void
  getNewRows: (tabId: string) => Array<{ id: string; values: Record<string, unknown> }>

  // Revert operations
  revertCellChange: (tabId: string, rowIndex: number, columnName: string) => void
  revertRowChanges: (tabId: string, rowIndex: number) => void
  revertAllChanges: (tabId: string) => void

  // Build operations for commit
  buildEditBatch: (tabId: string, columns: ColumnInfo[]) => EditBatch | null
  getPendingChangesCount: (tabId: string) => { updates: number; inserts: number; deletes: number }
  hasPendingChanges: (tabId: string) => boolean

  // Clear after commit
  clearPendingChanges: (tabId: string) => void
}

function getInitialTabEditState(): TabEditState {
  return {
    isEditMode: false,
    context: null,
    operations: [],
    editingCell: null,
    deletedRowIndices: new Set(),
    newRows: [],
    originalRows: new Map(),
    modifiedCells: new Map()
  }
}

export const useEditStore = create<EditStoreState>()((set, get) => ({
  tabEdits: new Map(),

  enterEditMode: (tabId, context) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()
      newTabEdits.set(tabId, {
        ...existing,
        isEditMode: true,
        context
      })
      return { tabEdits: newTabEdits }
    })
  },

  exitEditMode: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (existing) {
        newTabEdits.set(tabId, {
          ...existing,
          isEditMode: false,
          editingCell: null
        })
      }
      return { tabEdits: newTabEdits }
    })
  },

  isInEditMode: (tabId) => {
    return get().tabEdits.get(tabId)?.isEditMode ?? false
  },

  getEditContext: (tabId) => {
    return get().tabEdits.get(tabId)?.context ?? null
  },

  startCellEdit: (tabId, rowIndex, columnName) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()
      newTabEdits.set(tabId, {
        ...existing,
        editingCell: { rowIndex, columnName }
      })
      return { tabEdits: newTabEdits }
    })
  },

  cancelCellEdit: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (existing) {
        newTabEdits.set(tabId, {
          ...existing,
          editingCell: null
        })
      }
      return { tabEdits: newTabEdits }
    })
  },

  updateCellValue: (tabId, rowIndex, columnName, value, originalRow) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()

      const newModifiedCells = new Map(existing.modifiedCells)
      const newOriginalRows = new Map(existing.originalRows)

      const cellKey = `${rowIndex}:${columnName}`
      const originalValue = originalRow[columnName]

      // If value is same as original, remove the modification
      if (value === originalValue || (value === '' && originalValue === null)) {
        newModifiedCells.delete(cellKey)
        // Clean up originalRows if no more modified cells for this row
        const hasOtherModifications = Array.from(newModifiedCells.keys()).some((key) =>
          key.startsWith(`${rowIndex}:`)
        )
        if (!hasOtherModifications) {
          newOriginalRows.delete(rowIndex)
        }
      } else {
        newModifiedCells.set(cellKey, value)
        // Store original row if not already stored
        if (!newOriginalRows.has(rowIndex)) {
          newOriginalRows.set(rowIndex, originalRow)
        }
      }

      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        originalRows: newOriginalRows,
        editingCell: null
      })
      return { tabEdits: newTabEdits }
    })
  },

  getModifiedCellValue: (tabId, rowIndex, columnName) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit) return undefined
    return tabEdit.modifiedCells.get(`${rowIndex}:${columnName}`)
  },

  isCellModified: (tabId, rowIndex, columnName) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit) return false
    return tabEdit.modifiedCells.has(`${rowIndex}:${columnName}`)
  },

  markRowForDeletion: (tabId, rowIndex, originalRow) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()

      const newDeletedIndices = new Set(existing.deletedRowIndices)
      newDeletedIndices.add(rowIndex)

      const newOriginalRows = new Map(existing.originalRows)
      if (!newOriginalRows.has(rowIndex)) {
        newOriginalRows.set(rowIndex, originalRow)
      }

      newTabEdits.set(tabId, {
        ...existing,
        deletedRowIndices: newDeletedIndices,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  unmarkRowForDeletion: (tabId, rowIndex) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      const newDeletedIndices = new Set(existing.deletedRowIndices)
      newDeletedIndices.delete(rowIndex)

      newTabEdits.set(tabId, {
        ...existing,
        deletedRowIndices: newDeletedIndices
      })
      return { tabEdits: newTabEdits }
    })
  },

  isRowMarkedForDeletion: (tabId, rowIndex) => {
    return get().tabEdits.get(tabId)?.deletedRowIndices.has(rowIndex) ?? false
  },

  addNewRow: (tabId, defaultValues) => {
    const id = crypto.randomUUID()
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()

      newTabEdits.set(tabId, {
        ...existing,
        newRows: [...existing.newRows, { id, values: defaultValues }]
      })
      return { tabEdits: newTabEdits }
    })
    return id
  },

  updateNewRowValue: (tabId, rowId, columnName, value) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      const newRows = existing.newRows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnName]: value } } : row
      )

      newTabEdits.set(tabId, { ...existing, newRows })
      return { tabEdits: newTabEdits }
    })
  },

  removeNewRow: (tabId, rowId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      newTabEdits.set(tabId, {
        ...existing,
        newRows: existing.newRows.filter((r) => r.id !== rowId)
      })
      return { tabEdits: newTabEdits }
    })
  },

  getNewRows: (tabId) => {
    return get().tabEdits.get(tabId)?.newRows ?? []
  },

  revertCellChange: (tabId, rowIndex, columnName) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      const newModifiedCells = new Map(existing.modifiedCells)
      newModifiedCells.delete(`${rowIndex}:${columnName}`)

      // Clean up originalRows if no more modifications for this row
      const hasOtherModifications = Array.from(newModifiedCells.keys()).some((key) =>
        key.startsWith(`${rowIndex}:`)
      )
      const newOriginalRows = new Map(existing.originalRows)
      if (!hasOtherModifications && !existing.deletedRowIndices.has(rowIndex)) {
        newOriginalRows.delete(rowIndex)
      }

      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  revertRowChanges: (tabId, rowIndex) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      // Remove all cell modifications for this row
      const newModifiedCells = new Map(existing.modifiedCells)
      for (const key of newModifiedCells.keys()) {
        if (key.startsWith(`${rowIndex}:`)) {
          newModifiedCells.delete(key)
        }
      }

      // Unmark from deletion
      const newDeletedIndices = new Set(existing.deletedRowIndices)
      newDeletedIndices.delete(rowIndex)

      // Remove from originalRows
      const newOriginalRows = new Map(existing.originalRows)
      newOriginalRows.delete(rowIndex)

      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        deletedRowIndices: newDeletedIndices,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  revertAllChanges: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: new Map(),
        deletedRowIndices: new Set(),
        originalRows: new Map(),
        newRows: [],
        operations: []
      })
      return { tabEdits: newTabEdits }
    })
  },

  buildEditBatch: (tabId, columns) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit || !tabEdit.context) return null

    const operations: EditOperation[] = []
    const { context, modifiedCells, originalRows, deletedRowIndices, newRows } = tabEdit

    // Build UPDATE operations from modified cells
    const modifiedRowIndices = new Set<number>()
    for (const key of modifiedCells.keys()) {
      const [rowIndexStr] = key.split(':')
      modifiedRowIndices.add(parseInt(rowIndexStr))
    }

    for (const rowIndex of modifiedRowIndices) {
      // Skip if row is marked for deletion
      if (deletedRowIndices.has(rowIndex)) continue

      const originalRow = originalRows.get(rowIndex)
      if (!originalRow) continue

      const changes: CellChange[] = []
      for (const [key, newValue] of modifiedCells.entries()) {
        if (!key.startsWith(`${rowIndex}:`)) continue
        const columnName = key.split(':')[1]
        const colInfo = columns.find((c) => c.name === columnName)
        changes.push({
          column: columnName,
          oldValue: originalRow[columnName],
          newValue,
          dataType: colInfo?.dataType ?? 'text'
        })
      }

      if (changes.length > 0) {
        // Build primary key values
        const primaryKeys: PrimaryKeyValue[] = context.primaryKeyColumns.map((pkCol) => {
          const colInfo = columns.find((c) => c.name === pkCol)
          return {
            column: pkCol,
            value: originalRow[pkCol],
            dataType: colInfo?.dataType ?? 'text'
          }
        })

        const update: RowUpdate = {
          type: 'update',
          id: crypto.randomUUID(),
          primaryKeys,
          changes,
          originalRow
        }
        operations.push(update)
      }
    }

    // Build DELETE operations
    for (const rowIndex of deletedRowIndices) {
      const originalRow = originalRows.get(rowIndex)
      if (!originalRow) continue

      const primaryKeys: PrimaryKeyValue[] = context.primaryKeyColumns.map((pkCol) => {
        const colInfo = columns.find((c) => c.name === pkCol)
        return {
          column: pkCol,
          value: originalRow[pkCol],
          dataType: colInfo?.dataType ?? 'text'
        }
      })

      const deleteOp: RowDelete = {
        type: 'delete',
        id: crypto.randomUUID(),
        primaryKeys,
        originalRow
      }
      operations.push(deleteOp)
    }

    // Build INSERT operations
    for (const newRow of newRows) {
      const insert: RowInsert = {
        type: 'insert',
        id: newRow.id,
        values: newRow.values,
        columns: columns.map((c) => ({ name: c.name, dataType: c.dataType }))
      }
      operations.push(insert)
    }

    if (operations.length === 0) return null

    return {
      context,
      operations
    }
  },

  getPendingChangesCount: (tabId) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit) return { updates: 0, inserts: 0, deletes: 0 }

    // Count unique modified rows (excluding deleted ones)
    const modifiedRowIndices = new Set<number>()
    for (const key of tabEdit.modifiedCells.keys()) {
      const [rowIndexStr] = key.split(':')
      const rowIndex = parseInt(rowIndexStr)
      if (!tabEdit.deletedRowIndices.has(rowIndex)) {
        modifiedRowIndices.add(rowIndex)
      }
    }

    return {
      updates: modifiedRowIndices.size,
      inserts: tabEdit.newRows.length,
      deletes: tabEdit.deletedRowIndices.size
    }
  },

  hasPendingChanges: (tabId) => {
    const counts = get().getPendingChangesCount(tabId)
    return counts.updates > 0 || counts.inserts > 0 || counts.deletes > 0
  },

  clearPendingChanges: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state

      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: new Map(),
        deletedRowIndices: new Set(),
        originalRows: new Map(),
        newRows: [],
        operations: []
      })
      return { tabEdits: newTabEdits }
    })
  }
}))
