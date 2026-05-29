import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore, type QueryTab } from '../tab-store'

function queryTab(id: string, connectionId: string | null, overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id,
    type: 'query',
    title: 'Query',
    isPinned: false,
    connectionId,
    createdAt: 0,
    order: 0,
    query: 'select 1',
    savedQuery: '',
    result: null,
    multiResult: null,
    activeResultIndex: 0,
    error: null,
    isExecuting: false,
    executionId: null,
    currentPage: 1,
    pageSize: 100,
    ...overrides
  }
}

describe('tab-store cross-tab naming', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
  })

  it('setTabName normalizes and stores a valid name', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1')] })
    const res = useTabStore.getState().setTabName('a', '  Active_Users  ')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.normalized).toBe('active_users')
    expect((useTabStore.getState().getTab('a') as QueryTab).name).toBe('active_users')
  })

  it('rejects a duplicate name on the same connection', () => {
    useTabStore.setState({
      tabs: [queryTab('a', 'conn1', { name: 'recent' }), queryTab('b', 'conn1')]
    })
    const res = useTabStore.getState().setTabName('b', 'recent')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('duplicate')
  })

  it('allows the same name on a different connection', () => {
    useTabStore.setState({
      tabs: [queryTab('a', 'conn1', { name: 'recent' }), queryTab('b', 'conn2')]
    })
    const res = useTabStore.getState().setTabName('b', 'recent')
    expect(res.ok).toBe(true)
  })

  it('rejects a reserved word', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1')] })
    const res = useTabStore.getState().setTabName('a', 'select')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('reserved_word')
  })

  it('clearTabName removes the name', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1', { name: 'recent' })] })
    useTabStore.getState().clearTabName('a')
    expect((useTabStore.getState().getTab('a') as QueryTab).name).toBeUndefined()
  })

  it('getNamedTabs returns only named query tabs on the connection', () => {
    useTabStore.setState({
      tabs: [
        queryTab('a', 'conn1', { name: 'recent' }),
        queryTab('b', 'conn1'),
        queryTab('c', 'conn2', { name: 'other' })
      ]
    })
    const named = useTabStore.getState().getNamedTabs('conn1')
    expect(named.map((t) => t.id)).toEqual(['a'])
  })
})
