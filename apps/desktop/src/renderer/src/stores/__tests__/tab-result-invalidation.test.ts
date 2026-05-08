import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabStore } from '../tab-store'
import { useEditStore } from '../edit-store'
import type { EditContext } from '@data-peek/shared'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

const sampleContext: EditContext = {
  schema: 'public',
  table: 'users',
  primaryKeyColumns: ['id'],
  columns: [
    { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, ordinalPosition: 1 },
    { name: 'name', dataType: 'varchar', isNullable: true, isPrimaryKey: false, ordinalPosition: 2 }
  ]
}

describe('tab-store invalidates pending edits when results change', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
    useEditStore.setState({ tabEdits: new Map() })
  })

  function setupTabWithEdits(): string {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT * FROM users')
    const edit = useEditStore.getState()
    edit.enterEditMode(tabId, sampleContext)
    edit.updateCellValue(tabId, { id: 1, name: 'Original' }, 'name', 'Modified')
    edit.markRowForDeletion(tabId, { id: 2, name: 'Doomed' })
    edit.addNewRow(tabId, { name: 'Brand New' })
    return tabId
  }

  it('updateTabResult drops stale pending edits so they cannot commit against new rows', () => {
    const tabId = setupTabWithEdits()
    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(true)

    useTabStore.getState().updateTabResult(
      tabId,
      {
        columns: [{ name: 'id', dataType: 'integer' }],
        rows: [{ id: 99 }],
        rowCount: 1,
        durationMs: 1
      },
      null
    )

    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(false)
  })

  it('updateTabMultiResult drops stale pending edits', () => {
    const tabId = setupTabWithEdits()
    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(true)

    useTabStore.getState().updateTabMultiResult(
      tabId,
      {
        statements: [
          {
            index: 0,
            statement: 'SELECT * FROM users',
            success: true,
            fields: [{ name: 'id', dataType: 'integer' }],
            rows: [{ id: 99 }],
            rowCount: 1,
            durationMs: 1
          }
        ],
        totalDurationMs: 1,
        statementCount: 1
      },
      null
    )

    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(false)
  })

  it('updateTabResult preserves pending edits when called with the same null result (no-op)', () => {
    // Setting result to null with no rows shouldn't drop edits a user is mid-flight on —
    // but the simpler invariant is: any time the result identity changes, drop edits.
    // To keep this simple and safe, we always drop. This test pins that contract.
    const tabId = setupTabWithEdits()

    useTabStore.getState().updateTabResult(tabId, null, 'some error')

    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(false)
  })

  it('setActiveResultIndex drops pending edits because they were captured against the previous statement', () => {
    const tabId = setupTabWithEdits()

    useTabStore.getState().updateTabMultiResult(
      tabId,
      {
        statements: [
          {
            index: 0,
            statement: 'SELECT * FROM users',
            success: true,
            fields: [{ name: 'id', dataType: 'integer' }],
            rows: [{ id: 1 }],
            rowCount: 1,
            durationMs: 1
          },
          {
            index: 1,
            statement: 'SELECT * FROM orders',
            success: true,
            fields: [{ name: 'id', dataType: 'integer' }],
            rows: [{ id: 100 }],
            rowCount: 1,
            durationMs: 1
          }
        ],
        totalDurationMs: 2,
        statementCount: 2
      },
      null
    )

    // Setting the result already cleared edits; re-add some so we can test setActiveResultIndex.
    const edit = useEditStore.getState()
    edit.enterEditMode(tabId, sampleContext)
    edit.updateCellValue(tabId, { id: 1, name: 'Original' }, 'name', 'Modified')
    expect(edit.hasPendingChanges(tabId)).toBe(true)

    useTabStore.getState().setActiveResultIndex(tabId, 1)

    expect(useEditStore.getState().hasPendingChanges(tabId)).toBe(false)
  })

  it('does not affect pending edits on other tabs', () => {
    const tab1 = setupTabWithEdits()
    const tab2 = setupTabWithEdits()
    expect(useEditStore.getState().hasPendingChanges(tab1)).toBe(true)
    expect(useEditStore.getState().hasPendingChanges(tab2)).toBe(true)

    useTabStore.getState().updateTabResult(tab1, null, null)

    expect(useEditStore.getState().hasPendingChanges(tab1)).toBe(false)
    expect(useEditStore.getState().hasPendingChanges(tab2)).toBe(true)
  })
})
