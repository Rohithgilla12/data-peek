import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabStore } from '../tab-store'
import { useConnectionStore } from '../connection-store'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})
vi.stubGlobal('window', { api: { db: { cancelQuery: vi.fn() } } })

describe('updateTablePreviewPagination', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
    useConnectionStore.setState({
      connections: [
        {
          id: 'conn-1',
          name: 'Test',
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'u',
          password: 'p',
          ssl: false,
          isConnected: false,
          isConnecting: false,
          dstPort: 5432
        }
      ],
      activeConnectionId: 'conn-1'
    })
  })

  it('updates the page and pageSize without overwriting the user-rewritten SQL', () => {
    // Repro: open a table preview; rewrite the editor SQL to query a different table;
    // click "next page". Pagination state should advance, but the user's typed SQL
    // must not be silently replaced with a SELECT against the original stored table.
    const tabId = useTabStore
      .getState()
      .createTablePreviewTab('conn-1', 'public', 'admission_notes')

    const userTypedSql = 'SELECT * FROM birth_histories WHERE x = 1'
    useTabStore.getState().updateTabQuery(tabId, userTypedSql)

    useTabStore.getState().updateTablePreviewPagination(tabId, 2, 100, null)

    const tab = useTabStore.getState().getTab(tabId)
    expect(tab?.type).toBe('table-preview')
    if (tab?.type === 'table-preview') {
      expect(tab.currentPage).toBe(2)
      expect(tab.pageSize).toBe(100)
      expect(tab.query).toBe(userTypedSql)
    }
  })

  it('updates the query when a rebuiltQuery is supplied', () => {
    const tabId = useTabStore
      .getState()
      .createTablePreviewTab('conn-1', 'public', 'admission_notes')

    useTabStore
      .getState()
      .updateTablePreviewPagination(
        tabId,
        3,
        50,
        'SELECT * FROM "public"."admission_notes" LIMIT 50 OFFSET 100'
      )

    const tab = useTabStore.getState().getTab(tabId)
    if (tab?.type === 'table-preview') {
      expect(tab.currentPage).toBe(3)
      expect(tab.pageSize).toBe(50)
      expect(tab.query).toContain('LIMIT 50 OFFSET 100')
      expect(tab.savedQuery).toContain('LIMIT 50 OFFSET 100')
    }
  })
})
