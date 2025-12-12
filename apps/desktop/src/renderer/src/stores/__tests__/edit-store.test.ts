import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEditStore } from '../edit-store'
import type { EditContext, ColumnInfo } from '@data-peek/shared'

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

// Helper to create test context
const createContext = (overrides: Partial<EditContext> = {}): EditContext => ({
  schema: 'public',
  table: 'users',
  primaryKeyColumns: ['id'],
  columns: [
    { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, ordinalPosition: 1 },
    {
      name: 'name',
      dataType: 'varchar',
      isNullable: true,
      isPrimaryKey: false,
      ordinalPosition: 2
    },
    {
      name: 'email',
      dataType: 'varchar',
      isNullable: false,
      isPrimaryKey: false,
      ordinalPosition: 3
    }
  ],
  ...overrides
})

const testColumns: ColumnInfo[] = [
  { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, ordinalPosition: 1 },
  { name: 'name', dataType: 'varchar', isNullable: true, isPrimaryKey: false, ordinalPosition: 2 },
  { name: 'email', dataType: 'varchar', isNullable: false, isPrimaryKey: false, ordinalPosition: 3 }
]

describe('useEditStore', () => {
  const tabId = 'test-tab-1'

  beforeEach(() => {
    // Reset store state before each test
    useEditStore.setState({ tabEdits: new Map() })
  })

  describe('edit mode management', () => {
    it('should enter edit mode', () => {
      const store = useEditStore.getState()
      const context = createContext()

      store.enterEditMode(tabId, context)

      expect(store.isInEditMode(tabId)).toBe(true)
      expect(store.getEditContext(tabId)).toEqual(context)
    })

    it('should exit edit mode', () => {
      const store = useEditStore.getState()
      const context = createContext()

      store.enterEditMode(tabId, context)
      store.exitEditMode(tabId)

      expect(store.isInEditMode(tabId)).toBe(false)
      expect(store.getEditContext(tabId)).toEqual(context) // Context is preserved
    })

    it('should return false for edit mode on unknown tab', () => {
      const store = useEditStore.getState()

      expect(store.isInEditMode('unknown-tab')).toBe(false)
      expect(store.getEditContext('unknown-tab')).toBeNull()
    })

    it('should handle multiple tabs independently', () => {
      const store = useEditStore.getState()
      const context1 = createContext({ table: 'users' })
      const context2 = createContext({ table: 'orders' })

      store.enterEditMode('tab-1', context1)
      store.enterEditMode('tab-2', context2)

      expect(store.isInEditMode('tab-1')).toBe(true)
      expect(store.isInEditMode('tab-2')).toBe(true)
      expect(store.getEditContext('tab-1')?.table).toBe('users')
      expect(store.getEditContext('tab-2')?.table).toBe('orders')

      store.exitEditMode('tab-1')

      expect(store.isInEditMode('tab-1')).toBe(false)
      expect(store.isInEditMode('tab-2')).toBe(true)
    })
  })

  describe('cell editing', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should start cell edit', () => {
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')

      // Need to get fresh state after action
      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toEqual({ rowIndex: 0, columnName: 'name' })
    })

    it('should cancel cell edit', () => {
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')
      store.cancelCellEdit(tabId)

      const tabEdit = store.tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })

    it('should update cell value', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)

      expect(store.getModifiedCellValue(tabId, 0, 'name')).toBe('Jane')
      expect(store.isCellModified(tabId, 0, 'name')).toBe(true)
    })

    it('should remove modification when value matches original', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      expect(store.isCellModified(tabId, 0, 'name')).toBe(true)

      store.updateCellValue(tabId, 0, 'name', 'John', originalRow)
      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
    })

    it('should treat empty string as null when comparing to original null', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: null, email: 'test@test.com' }

      store.updateCellValue(tabId, 0, 'name', '', originalRow)

      // Empty string matching null should not be a modification
      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
    })

    it('should clear editing cell after update', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.startCellEdit(tabId, 0, 'name')
      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)

      const tabEdit = store.tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })

    it('should track multiple cell modifications in the same row', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.updateCellValue(tabId, 0, 'email', 'jane@example.com', originalRow)

      expect(store.isCellModified(tabId, 0, 'name')).toBe(true)
      expect(store.isCellModified(tabId, 0, 'email')).toBe(true)
      expect(store.getModifiedCellValue(tabId, 0, 'name')).toBe('Jane')
      expect(store.getModifiedCellValue(tabId, 0, 'email')).toBe('jane@example.com')
    })
  })

  describe('row deletion', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should mark row for deletion', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, 0, originalRow)

      expect(store.isRowMarkedForDeletion(tabId, 0)).toBe(true)
    })

    it('should unmark row for deletion', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, 0, originalRow)
      store.unmarkRowForDeletion(tabId, 0)

      expect(store.isRowMarkedForDeletion(tabId, 0)).toBe(false)
    })

    it('should track multiple deleted rows', () => {
      const store = useEditStore.getState()

      store.markRowForDeletion(tabId, 0, { id: 1, name: 'A' })
      store.markRowForDeletion(tabId, 2, { id: 3, name: 'C' })

      expect(store.isRowMarkedForDeletion(tabId, 0)).toBe(true)
      expect(store.isRowMarkedForDeletion(tabId, 1)).toBe(false)
      expect(store.isRowMarkedForDeletion(tabId, 2)).toBe(true)
    })
  })

  describe('new rows', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should add new row with default values', () => {
      const store = useEditStore.getState()

      const rowId = store.addNewRow(tabId, { name: '', email: '' })

      const newRows = store.getNewRows(tabId)
      expect(newRows).toHaveLength(1)
      expect(newRows[0].id).toBe(rowId)
      expect(newRows[0].values).toEqual({ name: '', email: '' })
    })

    it('should update new row value', () => {
      const store = useEditStore.getState()

      const rowId = store.addNewRow(tabId, { name: '', email: '' })
      store.updateNewRowValue(tabId, rowId, 'name', 'New User')

      const newRows = store.getNewRows(tabId)
      expect(newRows[0].values.name).toBe('New User')
    })

    it('should remove new row', () => {
      const store = useEditStore.getState()

      const rowId = store.addNewRow(tabId, { name: '' })
      store.removeNewRow(tabId, rowId)

      expect(store.getNewRows(tabId)).toHaveLength(0)
    })

    it('should add multiple new rows', () => {
      const store = useEditStore.getState()

      store.addNewRow(tabId, { name: 'User 1' })
      store.addNewRow(tabId, { name: 'User 2' })

      expect(store.getNewRows(tabId)).toHaveLength(2)
    })
  })

  describe('revert operations', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should revert single cell change', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.updateCellValue(tabId, 0, 'email', 'jane@example.com', originalRow)

      store.revertCellChange(tabId, 0, 'name')

      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
      expect(store.isCellModified(tabId, 0, 'email')).toBe(true)
    })

    it('should revert all row changes', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.updateCellValue(tabId, 0, 'email', 'jane@example.com', originalRow)

      store.revertRowChanges(tabId, 0)

      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
      expect(store.isCellModified(tabId, 0, 'email')).toBe(false)
    })

    it('should revert deletion when reverting row changes', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, 0, originalRow)
      expect(store.isRowMarkedForDeletion(tabId, 0)).toBe(true)

      store.revertRowChanges(tabId, 0)
      expect(store.isRowMarkedForDeletion(tabId, 0)).toBe(false)
    })

    it('should revert all changes', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.markRowForDeletion(tabId, 1, { id: 2, name: 'Bob' })
      store.addNewRow(tabId, { name: 'New' })

      store.revertAllChanges(tabId)

      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
      expect(store.isRowMarkedForDeletion(tabId, 1)).toBe(false)
      expect(store.getNewRows(tabId)).toHaveLength(0)
    })
  })

  describe('pending changes tracking', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should count pending updates', () => {
      const store = useEditStore.getState()

      store.updateCellValue(tabId, 0, 'name', 'A', { id: 1, name: 'B', email: 'test@test.com' })
      store.updateCellValue(tabId, 1, 'name', 'C', { id: 2, name: 'D', email: 'test2@test.com' })

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.updates).toBe(2)
    })

    it('should count pending inserts', () => {
      const store = useEditStore.getState()

      store.addNewRow(tabId, { name: 'A' })
      store.addNewRow(tabId, { name: 'B' })

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.inserts).toBe(2)
    })

    it('should count pending deletes', () => {
      const store = useEditStore.getState()

      store.markRowForDeletion(tabId, 0, { id: 1 })
      store.markRowForDeletion(tabId, 1, { id: 2 })

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.deletes).toBe(2)
    })

    it('should not count deleted rows as updates', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      // Modify and then delete the same row
      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.markRowForDeletion(tabId, 0, originalRow)

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.updates).toBe(0) // Not counted as update since it's deleted
      expect(counts.deletes).toBe(1)
    })

    it('should report hasPendingChanges correctly', () => {
      const store = useEditStore.getState()

      expect(store.hasPendingChanges(tabId)).toBe(false)

      store.addNewRow(tabId, { name: 'New' })
      expect(store.hasPendingChanges(tabId)).toBe(true)

      store.revertAllChanges(tabId)
      expect(store.hasPendingChanges(tabId)).toBe(false)
    })
  })

  describe('buildEditBatch', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should return null when no context', () => {
      const store = useEditStore.getState()
      store.exitEditMode(tabId)

      // Clear the context
      useEditStore.setState((state) => {
        const newTabEdits = new Map(state.tabEdits)
        const existing = newTabEdits.get(tabId)
        if (existing) {
          newTabEdits.set(tabId, { ...existing, context: null })
        }
        return { tabEdits: newTabEdits }
      })

      const batch = store.buildEditBatch(tabId, testColumns)
      expect(batch).toBeNull()
    })

    it('should return null when no changes', () => {
      const store = useEditStore.getState()

      const batch = store.buildEditBatch(tabId, testColumns)
      expect(batch).toBeNull()
    })

    it('should build update operations', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('update')

      const updateOp = batch!.operations[0] as {
        type: 'update'
        changes: Array<{ column: string; newValue: unknown }>
      }
      expect(updateOp.changes).toHaveLength(1)
      expect(updateOp.changes[0].column).toBe('name')
      expect(updateOp.changes[0].newValue).toBe('Jane')
    })

    it('should build delete operations', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, 0, originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('delete')
    })

    it('should build insert operations', () => {
      const store = useEditStore.getState()

      store.addNewRow(tabId, { name: 'New User', email: 'new@example.com' })

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('insert')

      const insertOp = batch!.operations[0] as { type: 'insert'; values: Record<string, unknown> }
      expect(insertOp.values.name).toBe('New User')
    })

    it('should skip update for deleted rows', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.markRowForDeletion(tabId, 0, originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('delete')
    })

    it('should include primary key values in operations', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 42, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)
      const updateOp = batch!.operations[0] as {
        type: 'update'
        primaryKeys: Array<{ column: string; value: unknown }>
      }

      expect(updateOp.primaryKeys).toHaveLength(1)
      expect(updateOp.primaryKeys[0].column).toBe('id')
      expect(updateOp.primaryKeys[0].value).toBe(42)
    })
  })

  describe('clearPendingChanges', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('should clear all pending changes while preserving edit mode', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, 0, 'name', 'Jane', originalRow)
      store.markRowForDeletion(tabId, 1, { id: 2, name: 'Bob' })
      store.addNewRow(tabId, { name: 'New' })

      store.clearPendingChanges(tabId)

      expect(store.isInEditMode(tabId)).toBe(true) // Edit mode preserved
      expect(store.hasPendingChanges(tabId)).toBe(false)
      expect(store.isCellModified(tabId, 0, 'name')).toBe(false)
      expect(store.isRowMarkedForDeletion(tabId, 1)).toBe(false)
      expect(store.getNewRows(tabId)).toHaveLength(0)
    })
  })
})
