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

  describe('cell editing (PK-keyed identity)', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('updates cell value identified by the row primary key', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')

      expect(store.getModifiedCellValue(tabId, originalRow, 'name')).toBe('Jane')
      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(true)
    })

    it('removes the modification when the value matches the original row value', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(true)

      store.updateCellValue(tabId, originalRow, 'name', 'John')
      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(false)
    })

    it('treats empty string as null when the original value is null', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: null, email: 'test@test.com' }

      store.updateCellValue(tabId, originalRow, 'name', '')

      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(false)
    })

    it('tracks multiple cell modifications for the same row', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      store.updateCellValue(tabId, originalRow, 'email', 'jane@example.com')

      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(true)
      expect(store.isCellModified(tabId, originalRow, 'email')).toBe(true)
      expect(store.getModifiedCellValue(tabId, originalRow, 'name')).toBe('Jane')
      expect(store.getModifiedCellValue(tabId, originalRow, 'email')).toBe('jane@example.com')
    })

    it('refuses to record an edit when the row has a null primary key value', () => {
      // Row with no usable PK identity. The store cannot safely build a WHERE clause
      // for this row, so it must reject the edit instead of silently corrupting data.
      const store = useEditStore.getState()
      const originalRow = { id: null, name: 'Orphan' }

      store.updateCellValue(tabId, originalRow, 'name', 'NewName')

      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(false)
      expect(store.hasPendingChanges(tabId)).toBe(false)
    })

    it('refuses to record an edit when the original row is missing a primary key column', () => {
      const store = useEditStore.getState()
      const originalRow = { name: 'Missing PK' } // no `id`

      store.updateCellValue(tabId, originalRow, 'name', 'NewName')

      expect(store.hasPendingChanges(tabId)).toBe(false)
    })

    it('handles composite primary keys', () => {
      const store = useEditStore.getState()
      store.enterEditMode(
        'composite-tab',
        createContext({
          table: 'memberships',
          primaryKeyColumns: ['userId', 'orgId']
        })
      )

      const rowA = { userId: 1, orgId: 10, role: 'member' }
      const rowB = { userId: 1, orgId: 20, role: 'member' }

      store.updateCellValue('composite-tab', rowA, 'role', 'admin')
      store.updateCellValue('composite-tab', rowB, 'role', 'owner')

      expect(store.getModifiedCellValue('composite-tab', rowA, 'role')).toBe('admin')
      expect(store.getModifiedCellValue('composite-tab', rowB, 'role')).toBe('owner')
      expect(store.getPendingChangesCount('composite-tab').updates).toBe(2)
    })
  })

  describe('row identity stability across display reordering', () => {
    // These tests cover the silent-corruption class of bug fixed by PK-based keying.
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('merges edits to the same row reached via different display positions', () => {
      // Repro: user edits row {id:5} at display index 0, then sorts the table; the same
      // row is now at display index 3; user edits another column on it. The store should
      // see ONE logical row with TWO column changes, not two separate operations.
      const store = useEditStore.getState()
      const row = { id: 5, name: 'Original', email: 'orig@example.com' }

      store.updateCellValue(tabId, row, 'name', 'Renamed')
      // ... sort happens; rowIndex changes; but originalRow is the same object/values
      store.updateCellValue(tabId, row, 'email', 'renamed@example.com')

      const batch = store.buildEditBatch(tabId, testColumns)
      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)

      const op = batch!.operations[0] as {
        type: 'update'
        changes: Array<{ column: string; newValue: unknown }>
      }
      expect(op.type).toBe('update')
      expect(op.changes.map((c) => c.column).sort()).toEqual(['email', 'name'])
    })

    it('keeps edits independent for different rows that happen to share a display position', () => {
      // Repro: user edits row {id:5} on page 1. Switches to page 2; now row {id:50} sits
      // at the same display position. Editing it must NOT collide with the first edit.
      const store = useEditStore.getState()
      const rowOnPage1 = { id: 5, name: 'A', email: 'a@example.com' }
      const rowOnPage2 = { id: 50, name: 'B', email: 'b@example.com' }

      store.updateCellValue(tabId, rowOnPage1, 'name', 'A-edit')
      store.updateCellValue(tabId, rowOnPage2, 'name', 'B-edit')

      expect(store.getModifiedCellValue(tabId, rowOnPage1, 'name')).toBe('A-edit')
      expect(store.getModifiedCellValue(tabId, rowOnPage2, 'name')).toBe('B-edit')

      const batch = store.buildEditBatch(tabId, testColumns)
      expect(batch!.operations).toHaveLength(2)
    })

    it('preserves the original PK in the WHERE clause regardless of edit ordering', () => {
      // Even if the user edits the same row many times from different display positions,
      // the WHERE clause must use the row's PK from the captured snapshot.
      const store = useEditStore.getState()
      const originalRow = { id: 42, name: 'Old', email: 'old@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'X')
      store.updateCellValue(tabId, originalRow, 'name', 'Y')
      store.updateCellValue(tabId, originalRow, 'name', 'Z')

      const batch = store.buildEditBatch(tabId, testColumns)
      const op = batch!.operations[0] as {
        type: 'update'
        primaryKeys: Array<{ column: string; value: unknown }>
        changes: Array<{ column: string; newValue: unknown }>
      }
      expect(op.primaryKeys[0].value).toBe(42)
      expect(op.changes[0].newValue).toBe('Z')
    })

    it('marks the correct row for deletion by PK identity', () => {
      const store = useEditStore.getState()
      const rowA = { id: 1, name: 'A' }
      const rowB = { id: 2, name: 'B' }

      store.markRowForDeletion(tabId, rowA)
      expect(store.isRowMarkedForDeletion(tabId, rowA)).toBe(true)
      expect(store.isRowMarkedForDeletion(tabId, rowB)).toBe(false)

      store.unmarkRowForDeletion(tabId, rowA)
      expect(store.isRowMarkedForDeletion(tabId, rowA)).toBe(false)
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

    it('reverts a single cell change', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      store.updateCellValue(tabId, originalRow, 'email', 'jane@example.com')

      store.revertCellChange(tabId, originalRow, 'name')

      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(false)
      expect(store.isCellModified(tabId, originalRow, 'email')).toBe(true)
    })

    it('reverts all changes for a row', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      store.updateCellValue(tabId, originalRow, 'email', 'jane@example.com')

      store.revertRowChanges(tabId, originalRow)

      expect(store.isCellModified(tabId, originalRow, 'name')).toBe(false)
      expect(store.isCellModified(tabId, originalRow, 'email')).toBe(false)
    })

    it('reverts deletion when reverting row changes', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, originalRow)
      expect(store.isRowMarkedForDeletion(tabId, originalRow)).toBe(true)

      store.revertRowChanges(tabId, originalRow)
      expect(store.isRowMarkedForDeletion(tabId, originalRow)).toBe(false)
    })

    it('reverts everything', () => {
      const store = useEditStore.getState()
      const rowA = { id: 1, name: 'John', email: 'john@example.com' }
      const rowB = { id: 2, name: 'Bob' }

      store.updateCellValue(tabId, rowA, 'name', 'Jane')
      store.markRowForDeletion(tabId, rowB)
      store.addNewRow(tabId, { name: 'New' })

      store.revertAllChanges(tabId)

      expect(store.isCellModified(tabId, rowA, 'name')).toBe(false)
      expect(store.isRowMarkedForDeletion(tabId, rowB)).toBe(false)
      expect(store.getNewRows(tabId)).toHaveLength(0)
    })
  })

  describe('pending changes tracking', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('counts pending updates by unique row identity', () => {
      const store = useEditStore.getState()

      store.updateCellValue(tabId, { id: 1, name: 'B', email: 'a@x' }, 'name', 'A')
      store.updateCellValue(tabId, { id: 2, name: 'D', email: 'b@x' }, 'name', 'C')
      // Multiple cells on the same row count as ONE update operation:
      store.updateCellValue(tabId, { id: 1, name: 'B', email: 'a@x' }, 'email', 'aa@x')

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.updates).toBe(2)
    })

    it('counts pending inserts', () => {
      const store = useEditStore.getState()

      store.addNewRow(tabId, { name: 'A' })
      store.addNewRow(tabId, { name: 'B' })

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.inserts).toBe(2)
    })

    it('counts pending deletes', () => {
      const store = useEditStore.getState()

      store.markRowForDeletion(tabId, { id: 1 })
      store.markRowForDeletion(tabId, { id: 2 })

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.deletes).toBe(2)
    })

    it('does not count modified rows that are also marked for deletion', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      store.markRowForDeletion(tabId, originalRow)

      const counts = store.getPendingChangesCount(tabId)
      expect(counts.updates).toBe(0)
      expect(counts.deletes).toBe(1)
    })

    it('reports hasPendingChanges correctly', () => {
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

    it('returns null when no context', () => {
      const store = useEditStore.getState()
      store.exitEditMode(tabId)

      // Manually clear the context (simulating internal state mutation)
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

    it('returns null when there are no changes', () => {
      const store = useEditStore.getState()

      const batch = store.buildEditBatch(tabId, testColumns)
      expect(batch).toBeNull()
    })

    it('builds an update operation', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')

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

    it('builds a delete operation', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.markRowForDeletion(tabId, originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('delete')
    })

    it('builds an insert operation', () => {
      const store = useEditStore.getState()

      store.addNewRow(tabId, { name: 'New User', email: 'new@example.com' })

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch).not.toBeNull()
      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('insert')

      const insertOp = batch!.operations[0] as { type: 'insert'; values: Record<string, unknown> }
      expect(insertOp.values.name).toBe('New User')
    })

    it('skips the update for a row that is also marked for deletion', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')
      store.markRowForDeletion(tabId, originalRow)

      const batch = store.buildEditBatch(tabId, testColumns)

      expect(batch!.operations).toHaveLength(1)
      expect(batch!.operations[0].type).toBe('delete')
    })

    it('includes the row primary key in update operations', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 42, name: 'John', email: 'john@example.com' }

      store.updateCellValue(tabId, originalRow, 'name', 'Jane')

      const batch = store.buildEditBatch(tabId, testColumns)
      const updateOp = batch!.operations[0] as {
        type: 'update'
        primaryKeys: Array<{ column: string; value: unknown }>
      }

      expect(updateOp.primaryKeys).toHaveLength(1)
      expect(updateOp.primaryKeys[0].column).toBe('id')
      expect(updateOp.primaryKeys[0].value).toBe(42)
    })

    it('includes all primary key columns for composite keys', () => {
      const store = useEditStore.getState()
      store.enterEditMode(
        'composite-tab',
        createContext({
          table: 'memberships',
          primaryKeyColumns: ['userId', 'orgId']
        })
      )
      const originalRow = { userId: 7, orgId: 99, role: 'member' }

      store.updateCellValue('composite-tab', originalRow, 'role', 'admin')

      const batch = store.buildEditBatch('composite-tab', testColumns)
      const updateOp = batch!.operations[0] as {
        type: 'update'
        primaryKeys: Array<{ column: string; value: unknown }>
      }
      const pkMap = Object.fromEntries(updateOp.primaryKeys.map((p) => [p.column, p.value]))
      expect(pkMap).toEqual({ userId: 7, orgId: 99 })
    })
  })

  describe('cell focus (transient UI state)', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('tracks the currently editing cell by display position', () => {
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')

      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toEqual({ rowIndex: 0, columnName: 'name' })
    })

    it('clears editing cell on cancel', () => {
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')
      store.cancelCellEdit(tabId)

      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })

    it('clears the editing cell after a value update', () => {
      const store = useEditStore.getState()
      const originalRow = { id: 1, name: 'John', email: 'john@example.com' }

      store.startCellEdit(tabId, 0, 'name')
      store.updateCellValue(tabId, originalRow, 'name', 'Jane')

      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })
  })

  describe('clearPendingChanges', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('clears all pending changes while preserving edit mode', () => {
      const store = useEditStore.getState()
      const rowA = { id: 1, name: 'John', email: 'john@example.com' }
      const rowB = { id: 2, name: 'Bob' }

      store.updateCellValue(tabId, rowA, 'name', 'Jane')
      store.markRowForDeletion(tabId, rowB)
      store.addNewRow(tabId, { name: 'New' })

      store.clearPendingChanges(tabId)

      expect(store.isInEditMode(tabId)).toBe(true)
      expect(store.hasPendingChanges(tabId)).toBe(false)
      expect(store.isCellModified(tabId, rowA, 'name')).toBe(false)
      expect(store.isRowMarkedForDeletion(tabId, rowB)).toBe(false)
      expect(store.getNewRows(tabId)).toHaveLength(0)
    })

    it('clears the editing cell focus too', () => {
      // Otherwise a cell that was mid-edit when results were replaced reappears as
      // "in edit mode" at the same display index over fresh rows, and Enter commits
      // an UPDATE the user never meant to make.
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')
      store.clearPendingChanges(tabId)

      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })
  })

  describe('revertAllChanges', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext())
    })

    it('clears the editing cell focus too', () => {
      const store = useEditStore.getState()

      store.startCellEdit(tabId, 0, 'name')
      store.revertAllChanges(tabId)

      const tabEdit = useEditStore.getState().tabEdits.get(tabId)
      expect(tabEdit?.editingCell).toBeNull()
    })
  })

  describe('bigint primary keys (no JSON.stringify throw)', () => {
    beforeEach(() => {
      const store = useEditStore.getState()
      store.enterEditMode(tabId, createContext({ primaryKeyColumns: ['id'] }))
    })

    it('records an edit for a row whose PK value is a bigint without throwing', () => {
      // pg returns bigint as string by default but pg-types can be configured to
      // produce native BigInt. JSON.stringify throws on BigInt, and the throw used
      // to happen inside a Zustand updater — leaving the store mid-mutation and
      // killing every subsequent edit on the tab.
      const store = useEditStore.getState()
      const row = { id: 9007199254740993n, name: 'Big' }

      expect(() => store.updateCellValue(tabId, row, 'name', 'Bigger')).not.toThrow()
      expect(store.getModifiedCellValue(tabId, row, 'name')).toBe('Bigger')
    })

    it('treats two rows with different bigint PKs as independent', () => {
      const store = useEditStore.getState()
      const a = { id: 1n, name: 'A' }
      const b = { id: 2n, name: 'B' }

      store.updateCellValue(tabId, a, 'name', 'A-edit')
      store.updateCellValue(tabId, b, 'name', 'B-edit')

      expect(store.getModifiedCellValue(tabId, a, 'name')).toBe('A-edit')
      expect(store.getModifiedCellValue(tabId, b, 'name')).toBe('B-edit')
    })
  })
})
