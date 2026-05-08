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
 * Edit mode state per tab.
 *
 * Pending edits are keyed by the row's primary-key value(s), not by display position.
 * This is the difference between an UPDATE landing on the row the user actually edited
 * and an UPDATE landing on whatever happens to sit at that display index after the user
 * sorts, paginates, or filters the table.
 */
interface TabEditState {
  /** Whether edit mode is active for this tab */
  isEditMode: boolean
  /** Edit context (schema, table, pk columns) */
  context: EditContext | null
  /** Pending operations */
  operations: EditOperation[]
  /** Currently editing cell — display position, transient UI focus state */
  editingCell: { rowIndex: number; columnName: string } | null
  /** Rows marked for deletion, keyed by stable PK identity */
  deletedRowKeys: Set<string>
  /** New rows being added (not yet in database) */
  newRows: Array<{ id: string; values: Record<string, unknown> }>
  /** Original row snapshot per modified row, keyed by PK identity */
  originalRows: Map<string, Record<string, unknown>>
  /** Modified cell values, keyed by PK identity → column → new value */
  modifiedCells: Map<string, Map<string, unknown>>
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

  // Cell editing — identified by the row's PK value(s) carried in originalRow
  startCellEdit: (tabId: string, rowIndex: number, columnName: string) => void
  cancelCellEdit: (tabId: string) => void
  updateCellValue: (
    tabId: string,
    originalRow: Record<string, unknown>,
    columnName: string,
    value: unknown
  ) => void
  getModifiedCellValue: (
    tabId: string,
    originalRow: Record<string, unknown>,
    columnName: string
  ) => unknown | undefined
  isCellModified: (
    tabId: string,
    originalRow: Record<string, unknown>,
    columnName: string
  ) => boolean

  // Row operations
  markRowForDeletion: (tabId: string, originalRow: Record<string, unknown>) => void
  unmarkRowForDeletion: (tabId: string, originalRow: Record<string, unknown>) => void
  isRowMarkedForDeletion: (tabId: string, originalRow: Record<string, unknown>) => boolean
  addNewRow: (tabId: string, defaultValues: Record<string, unknown>) => string
  updateNewRowValue: (tabId: string, rowId: string, columnName: string, value: unknown) => void
  removeNewRow: (tabId: string, rowId: string) => void
  getNewRows: (tabId: string) => Array<{ id: string; values: Record<string, unknown> }>

  // Revert operations
  revertCellChange: (
    tabId: string,
    originalRow: Record<string, unknown>,
    columnName: string
  ) => void
  revertRowChanges: (tabId: string, originalRow: Record<string, unknown>) => void
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
    deletedRowKeys: new Set(),
    newRows: [],
    originalRows: new Map(),
    modifiedCells: new Map()
  }
}

/**
 * Build a stable identity string from a row's primary key values.
 *
 * Returns `null` when the row cannot be identified — missing PK columns or null PK
 * values. Callers must treat null as "edit not allowed for this row" rather than
 * silently inventing a key, otherwise UPDATE/DELETE could land on the wrong row.
 */
function makeRowKey(
  originalRow: Record<string, unknown>,
  pkColumns: readonly string[]
): string | null {
  if (pkColumns.length === 0) return null
  const values: unknown[] = []
  for (const col of pkColumns) {
    if (!(col in originalRow)) return null
    const value = originalRow[col]
    if (value === null || value === undefined) return null
    values.push(value)
  }
  return JSON.stringify(values)
}

function getRowKey(
  state: EditStoreState,
  tabId: string,
  originalRow: Record<string, unknown>
): string | null {
  const ctx = state.tabEdits.get(tabId)?.context
  if (!ctx) return null
  return makeRowKey(originalRow, ctx.primaryKeyColumns)
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

  updateCellValue: (tabId, originalRow, columnName, value) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing?.context) return state

      const rowKey = makeRowKey(originalRow, existing.context.primaryKeyColumns)
      // Reject edits we can't safely identify — better to drop the keystroke than
      // build an UPDATE with no usable WHERE clause.
      if (rowKey === null) {
        // Still clear any active cell-edit focus so the UI doesn't get stuck.
        if (existing.editingCell === null) return state
        const newTabEdits = new Map(state.tabEdits)
        newTabEdits.set(tabId, { ...existing, editingCell: null })
        return { tabEdits: newTabEdits }
      }

      const newModifiedCells = new Map(existing.modifiedCells)
      const newOriginalRows = new Map(existing.originalRows)
      const rowCells = new Map(newModifiedCells.get(rowKey) ?? [])

      const originalValue = originalRow[columnName]
      const isReverted = value === originalValue || (value === '' && originalValue === null)

      if (isReverted) {
        rowCells.delete(columnName)
        if (rowCells.size === 0) {
          newModifiedCells.delete(rowKey)
          // Drop the snapshot too if there's no other reason to hold it.
          if (!existing.deletedRowKeys.has(rowKey)) {
            newOriginalRows.delete(rowKey)
          }
        } else {
          newModifiedCells.set(rowKey, rowCells)
        }
      } else {
        rowCells.set(columnName, value)
        newModifiedCells.set(rowKey, rowCells)
        if (!newOriginalRows.has(rowKey)) {
          newOriginalRows.set(rowKey, originalRow)
        }
      }

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        originalRows: newOriginalRows,
        editingCell: null
      })
      return { tabEdits: newTabEdits }
    })
  },

  getModifiedCellValue: (tabId, originalRow, columnName) => {
    const state = get()
    const tabEdit = state.tabEdits.get(tabId)
    if (!tabEdit) return undefined
    const rowKey = getRowKey(state, tabId, originalRow)
    if (rowKey === null) return undefined
    return tabEdit.modifiedCells.get(rowKey)?.get(columnName)
  },

  isCellModified: (tabId, originalRow, columnName) => {
    const state = get()
    const tabEdit = state.tabEdits.get(tabId)
    if (!tabEdit) return false
    const rowKey = getRowKey(state, tabId, originalRow)
    if (rowKey === null) return false
    return tabEdit.modifiedCells.get(rowKey)?.has(columnName) ?? false
  },

  markRowForDeletion: (tabId, originalRow) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing?.context) return state

      const rowKey = makeRowKey(originalRow, existing.context.primaryKeyColumns)
      if (rowKey === null) return state

      const newDeletedKeys = new Set(existing.deletedRowKeys)
      newDeletedKeys.add(rowKey)

      const newOriginalRows = new Map(existing.originalRows)
      if (!newOriginalRows.has(rowKey)) {
        newOriginalRows.set(rowKey, originalRow)
      }

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        deletedRowKeys: newDeletedKeys,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  unmarkRowForDeletion: (tabId, originalRow) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing?.context) return state

      const rowKey = makeRowKey(originalRow, existing.context.primaryKeyColumns)
      if (rowKey === null || !existing.deletedRowKeys.has(rowKey)) return state

      const newDeletedKeys = new Set(existing.deletedRowKeys)
      newDeletedKeys.delete(rowKey)

      // If there are no edits on this row either, drop the snapshot.
      const newOriginalRows = new Map(existing.originalRows)
      if (!existing.modifiedCells.has(rowKey)) {
        newOriginalRows.delete(rowKey)
      }

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        deletedRowKeys: newDeletedKeys,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  isRowMarkedForDeletion: (tabId, originalRow) => {
    const state = get()
    const tabEdit = state.tabEdits.get(tabId)
    if (!tabEdit) return false
    const rowKey = getRowKey(state, tabId, originalRow)
    if (rowKey === null) return false
    return tabEdit.deletedRowKeys.has(rowKey)
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

  revertCellChange: (tabId, originalRow, columnName) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing?.context) return state

      const rowKey = makeRowKey(originalRow, existing.context.primaryKeyColumns)
      if (rowKey === null) return state

      const rowCells = existing.modifiedCells.get(rowKey)
      if (!rowCells || !rowCells.has(columnName)) return state

      const newRowCells = new Map(rowCells)
      newRowCells.delete(columnName)

      const newModifiedCells = new Map(existing.modifiedCells)
      const newOriginalRows = new Map(existing.originalRows)

      if (newRowCells.size === 0) {
        newModifiedCells.delete(rowKey)
        if (!existing.deletedRowKeys.has(rowKey)) {
          newOriginalRows.delete(rowKey)
        }
      } else {
        newModifiedCells.set(rowKey, newRowCells)
      }

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  revertRowChanges: (tabId, originalRow) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing?.context) return state

      const rowKey = makeRowKey(originalRow, existing.context.primaryKeyColumns)
      if (rowKey === null) return state

      const newModifiedCells = new Map(existing.modifiedCells)
      newModifiedCells.delete(rowKey)

      const newDeletedKeys = new Set(existing.deletedRowKeys)
      newDeletedKeys.delete(rowKey)

      const newOriginalRows = new Map(existing.originalRows)
      newOriginalRows.delete(rowKey)

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: newModifiedCells,
        deletedRowKeys: newDeletedKeys,
        originalRows: newOriginalRows
      })
      return { tabEdits: newTabEdits }
    })
  },

  revertAllChanges: (tabId) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing) return state

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: new Map(),
        deletedRowKeys: new Set(),
        originalRows: new Map(),
        newRows: [],
        operations: []
      })
      return { tabEdits: newTabEdits }
    })
  },

  buildEditBatch: (tabId, columns) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit?.context) return null

    const operations: EditOperation[] = []
    const { context, modifiedCells, originalRows, deletedRowKeys, newRows } = tabEdit

    // UPDATEs
    for (const [rowKey, cells] of modifiedCells.entries()) {
      if (deletedRowKeys.has(rowKey)) continue
      const originalRow = originalRows.get(rowKey)
      if (!originalRow) continue

      const changes: CellChange[] = []
      for (const [columnName, newValue] of cells.entries()) {
        const colInfo = columns.find((c) => c.name === columnName)
        changes.push({
          column: columnName,
          oldValue: originalRow[columnName],
          newValue,
          dataType: colInfo?.dataType ?? 'text'
        })
      }
      if (changes.length === 0) continue

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

    // DELETEs
    for (const rowKey of deletedRowKeys) {
      const originalRow = originalRows.get(rowKey)
      if (!originalRow) continue

      const primaryKeys: PrimaryKeyValue[] = context.primaryKeyColumns.map((pkCol) => {
        const colInfo = columns.find((c) => c.name === pkCol)
        return {
          column: pkCol,
          value: originalRow[pkCol],
          dataType: colInfo?.dataType ?? 'text'
        }
      })

      operations.push({
        type: 'delete',
        id: crypto.randomUUID(),
        primaryKeys,
        originalRow
      } satisfies RowDelete)
    }

    // INSERTs
    for (const newRow of newRows) {
      operations.push({
        type: 'insert',
        id: newRow.id,
        values: newRow.values,
        columns: columns.map((c) => ({ name: c.name, dataType: c.dataType }))
      } satisfies RowInsert)
    }

    if (operations.length === 0) return null

    return { context, operations }
  },

  getPendingChangesCount: (tabId) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit) return { updates: 0, inserts: 0, deletes: 0 }

    let updates = 0
    for (const rowKey of tabEdit.modifiedCells.keys()) {
      if (!tabEdit.deletedRowKeys.has(rowKey)) updates++
    }

    return {
      updates,
      inserts: tabEdit.newRows.length,
      deletes: tabEdit.deletedRowKeys.size
    }
  },

  hasPendingChanges: (tabId) => {
    const counts = get().getPendingChangesCount(tabId)
    return counts.updates > 0 || counts.inserts > 0 || counts.deletes > 0
  },

  clearPendingChanges: (tabId) => {
    set((state) => {
      const existing = state.tabEdits.get(tabId)
      if (!existing) return state

      const newTabEdits = new Map(state.tabEdits)
      newTabEdits.set(tabId, {
        ...existing,
        modifiedCells: new Map(),
        deletedRowKeys: new Set(),
        originalRows: new Map(),
        newRows: [],
        operations: []
      })
      return { tabEdits: newTabEdits }
    })
  }
}))
