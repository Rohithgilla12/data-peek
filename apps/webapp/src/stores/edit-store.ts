import { create } from 'zustand'

interface EditContext {
  schema: string
  table: string
  primaryKeyColumns: string[]
  columns: { name: string; dataType: string }[]
}

interface TabEditState {
  isEditMode: boolean
  context: EditContext | null
  editingCell: { rowIndex: number; columnName: string } | null
  deletedRowIndices: Set<number>
  newRows: Array<{ id: string; values: Record<string, unknown> }>
  originalRows: Map<number, Record<string, unknown>>
  modifiedCells: Map<string, unknown>
}

interface EditState {
  tabEdits: Map<string, TabEditState>

  enterEditMode: (tabId: string, context: EditContext) => void
  exitEditMode: (tabId: string) => void
  isInEditMode: (tabId: string) => boolean
  getEditContext: (tabId: string) => EditContext | null

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

  markRowForDeletion: (tabId: string, rowIndex: number, originalRow: Record<string, unknown>) => void
  unmarkRowForDeletion: (tabId: string, rowIndex: number) => void
  isRowMarkedForDeletion: (tabId: string, rowIndex: number) => boolean
  addNewRow: (tabId: string, defaultValues: Record<string, unknown>) => string
  updateNewRowValue: (tabId: string, rowId: string, columnName: string, value: unknown) => void
  removeNewRow: (tabId: string, rowId: string) => void
  getNewRows: (tabId: string) => Array<{ id: string; values: Record<string, unknown> }>

  revertAllChanges: (tabId: string) => void
  clearPendingChanges: (tabId: string) => void
  hasPendingChanges: (tabId: string) => boolean
  getPendingChangesCount: (tabId: string) => { updates: number; inserts: number; deletes: number }

  buildEditSql: (tabId: string, rows: Record<string, unknown>[], dbType: string) => string[]
}

function getInitialTabEditState(): TabEditState {
  return {
    isEditMode: false,
    context: null,
    editingCell: null,
    deletedRowIndices: new Set(),
    newRows: [],
    originalRows: new Map(),
    modifiedCells: new Map(),
  }
}

function escapeId(name: string, dbType: string): string {
  if (dbType === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

function escapeLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

export const useEditStore = create<EditState>()((set, get) => ({
  tabEdits: new Map(),

  enterEditMode: (tabId, context) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()
      newTabEdits.set(tabId, { ...existing, isEditMode: true, context })
      return { tabEdits: newTabEdits }
    })
  },

  exitEditMode: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (existing) {
        newTabEdits.set(tabId, { ...existing, isEditMode: false, editingCell: null })
      }
      return { tabEdits: newTabEdits }
    })
  },

  isInEditMode: (tabId) => get().tabEdits.get(tabId)?.isEditMode ?? false,
  getEditContext: (tabId) => get().tabEdits.get(tabId)?.context ?? null,

  startCellEdit: (tabId, rowIndex, columnName) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()
      newTabEdits.set(tabId, { ...existing, editingCell: { rowIndex, columnName } })
      return { tabEdits: newTabEdits }
    })
  },

  cancelCellEdit: (tabId) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (existing) {
        newTabEdits.set(tabId, { ...existing, editingCell: null })
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

      if (value === originalValue || (value === '' && originalValue === null)) {
        newModifiedCells.delete(cellKey)
        const hasOtherMods = Array.from(newModifiedCells.keys()).some((k) => k.startsWith(`${rowIndex}:`))
        if (!hasOtherMods) newOriginalRows.delete(rowIndex)
      } else {
        newModifiedCells.set(cellKey, value)
        if (!newOriginalRows.has(rowIndex)) newOriginalRows.set(rowIndex, originalRow)
      }

      newTabEdits.set(tabId, { ...existing, modifiedCells: newModifiedCells, originalRows: newOriginalRows, editingCell: null })
      return { tabEdits: newTabEdits }
    })
  },

  getModifiedCellValue: (tabId, rowIndex, columnName) => {
    return get().tabEdits.get(tabId)?.modifiedCells.get(`${rowIndex}:${columnName}`)
  },

  isCellModified: (tabId, rowIndex, columnName) => {
    return get().tabEdits.get(tabId)?.modifiedCells.has(`${rowIndex}:${columnName}`) ?? false
  },

  markRowForDeletion: (tabId, rowIndex, originalRow) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId) ?? getInitialTabEditState()
      const newDeleted = new Set(existing.deletedRowIndices)
      newDeleted.add(rowIndex)
      const newOriginalRows = new Map(existing.originalRows)
      if (!newOriginalRows.has(rowIndex)) newOriginalRows.set(rowIndex, originalRow)
      newTabEdits.set(tabId, { ...existing, deletedRowIndices: newDeleted, originalRows: newOriginalRows })
      return { tabEdits: newTabEdits }
    })
  },

  unmarkRowForDeletion: (tabId, rowIndex) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state
      const newDeleted = new Set(existing.deletedRowIndices)
      newDeleted.delete(rowIndex)
      newTabEdits.set(tabId, { ...existing, deletedRowIndices: newDeleted })
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
      newTabEdits.set(tabId, { ...existing, newRows: [...existing.newRows, { id, values: defaultValues }] })
      return { tabEdits: newTabEdits }
    })
    return id
  },

  updateNewRowValue: (tabId, rowId, columnName, value) => {
    set((state) => {
      const newTabEdits = new Map(state.tabEdits)
      const existing = newTabEdits.get(tabId)
      if (!existing) return state
      const newRows = existing.newRows.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, [columnName]: value } } : r
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
      newTabEdits.set(tabId, { ...existing, newRows: existing.newRows.filter((r) => r.id !== rowId) })
      return { tabEdits: newTabEdits }
    })
  },

  getNewRows: (tabId) => get().tabEdits.get(tabId)?.newRows ?? [],

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
      })
      return { tabEdits: newTabEdits }
    })
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
      })
      return { tabEdits: newTabEdits }
    })
  },

  hasPendingChanges: (tabId) => {
    const counts = get().getPendingChangesCount(tabId)
    return counts.updates > 0 || counts.inserts > 0 || counts.deletes > 0
  },

  getPendingChangesCount: (tabId) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit) return { updates: 0, inserts: 0, deletes: 0 }
    const modifiedRowIndices = new Set<number>()
    for (const key of tabEdit.modifiedCells.keys()) {
      const rowIndex = parseInt(key.split(':')[0])
      if (!tabEdit.deletedRowIndices.has(rowIndex)) modifiedRowIndices.add(rowIndex)
    }
    return {
      updates: modifiedRowIndices.size,
      inserts: tabEdit.newRows.length,
      deletes: tabEdit.deletedRowIndices.size,
    }
  },

  buildEditSql: (tabId, _rows, dbType) => {
    const tabEdit = get().tabEdits.get(tabId)
    if (!tabEdit?.context) return []

    const { context, modifiedCells, originalRows, deletedRowIndices, newRows } = tabEdit
    const statements: string[] = []
    const tableRef = `${escapeId(context.schema, dbType)}.${escapeId(context.table, dbType)}`

    // Build UPDATE statements
    const modifiedRowIndices = new Set<number>()
    for (const key of modifiedCells.keys()) {
      const rowIndex = parseInt(key.split(':')[0])
      if (!deletedRowIndices.has(rowIndex)) modifiedRowIndices.add(rowIndex)
    }

    for (const rowIndex of modifiedRowIndices) {
      const originalRow = originalRows.get(rowIndex)
      if (!originalRow) continue

      const setClauses: string[] = []
      for (const [key, newValue] of modifiedCells.entries()) {
        if (!key.startsWith(`${rowIndex}:`)) continue
        const columnName = key.split(':').slice(1).join(':')
        setClauses.push(`${escapeId(columnName, dbType)} = ${escapeLiteral(newValue)}`)
      }

      const whereClauses = context.primaryKeyColumns.map(
        (pk) => `${escapeId(pk, dbType)} = ${escapeLiteral(originalRow[pk])}`
      )

      if (setClauses.length > 0 && whereClauses.length > 0) {
        statements.push(`UPDATE ${tableRef} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`)
      }
    }

    // Build DELETE statements
    for (const rowIndex of deletedRowIndices) {
      const originalRow = originalRows.get(rowIndex)
      if (!originalRow) continue

      const whereClauses = context.primaryKeyColumns.map(
        (pk) => `${escapeId(pk, dbType)} = ${escapeLiteral(originalRow[pk])}`
      )

      if (whereClauses.length > 0) {
        statements.push(`DELETE FROM ${tableRef} WHERE ${whereClauses.join(' AND ')}`)
      }
    }

    // Build INSERT statements
    for (const newRow of newRows) {
      const cols = Object.keys(newRow.values).filter((k) => newRow.values[k] !== undefined && newRow.values[k] !== '')
      if (cols.length === 0) continue
      const colNames = cols.map((c) => escapeId(c, dbType)).join(', ')
      const values = cols.map((c) => escapeLiteral(newRow.values[c])).join(', ')
      statements.push(`INSERT INTO ${tableRef} (${colNames}) VALUES (${values})`)
    }

    return statements
  },
}))
