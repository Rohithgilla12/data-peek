import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabStore } from '../tab-store'
import { useConnectionStore, type ConnectionWithStatus } from '../connection-store'
import { useNotificationStore } from '../notification-store'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

const cancelQuery = vi.fn().mockResolvedValue({ success: true })
const deleteConnection = vi.fn()
const setConnectionInfo = vi.fn()

vi.stubGlobal('window', {
  api: {
    db: { cancelQuery },
    connections: { delete: deleteConnection },
    window: { setConnectionInfo }
  }
})

const conn = (id: string) =>
  ({
    id,
    name: id,
    host: 'localhost',
    port: 5432,
    database: id,
    user: 'u',
    dbType: 'postgresql',
    dstPort: 5432,
    isConnected: true,
    isConnecting: false
  }) as ConnectionWithStatus

const tabs = () => useTabStore.getState()

describe('deleting a connection', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
    useConnectionStore.setState({
      connections: [conn('a'), conn('b')],
      activeConnectionId: 'a',
      schemas: [{ name: 'public', tables: [] }] as never
    })
    useNotificationStore.setState({ notifications: [] })
    vi.clearAllMocks()
  })

  it('closes connection-bound tabs and detaches query and ask tabs, keeping their content', async () => {
    const query = tabs().createQueryTab('a', 'SELECT 1')
    tabs().createTablePreviewTab('a', 'public', 'users')
    tabs().createERDTab('a')
    const ask = tabs().createAskTab('a')
    const other = tabs().createQueryTab('b', 'SELECT 2')
    deleteConnection.mockResolvedValue({ success: true })

    await useConnectionStore.getState().removeConnection('a')

    expect(tabs().tabs.map((t) => t.id)).toEqual([query, ask, other])
    expect(tabs().getTab(ask)?.connectionId).toBeNull()
    const detached = tabs().getTab(query)
    expect(detached?.connectionId).toBeNull()
    expect(detached && 'query' in detached && detached.query).toBe('SELECT 1')
    expect(tabs().getTab(other)?.connectionId).toBe('b')
  })

  it('moves focus to the nearest surviving tab when the active tab is closed', async () => {
    const first = tabs().createQueryTab('b')
    tabs().createERDTab('a')
    const last = tabs().createQueryTab('b')
    tabs().setActiveTab(tabs().tabs[1].id)
    deleteConnection.mockResolvedValue({ success: true })

    await useConnectionStore.getState().removeConnection('a')

    expect(tabs().activeTabId).toBe(last)
    expect(tabs().tabs.map((t) => t.id)).toEqual([first, last])
  })

  it('cancels a query still running on the deleted connection', async () => {
    const id = tabs().createQueryTab('a', 'SELECT pg_sleep(10)')
    tabs().updateTabExecuting(id, true, 'exec-1')
    deleteConnection.mockResolvedValue({ success: true })

    await useConnectionStore.getState().removeConnection('a')

    expect(cancelQuery).toHaveBeenCalledWith('exec-1')
    const tab = tabs().getTab(id)
    expect(tab && 'isExecuting' in tab && tab.isExecuting).toBe(false)
  })

  it('clears the active connection and its schemas through setActiveConnection', async () => {
    deleteConnection.mockResolvedValue({ success: true })

    await useConnectionStore.getState().removeConnection('a')

    const state = useConnectionStore.getState()
    expect(state.activeConnectionId).toBeNull()
    expect(state.schemas).toEqual([])
    expect(setConnectionInfo).toHaveBeenCalledWith(null)
  })

  it('leaves everything alone and tells the user when the delete fails', async () => {
    const id = tabs().createERDTab('a')
    deleteConnection.mockResolvedValue({ success: false, error: 'locked' })

    await useConnectionStore.getState().removeConnection('a')

    expect(useConnectionStore.getState().connections).toHaveLength(2)
    expect(tabs().getTab(id)).toBeDefined()
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'error',
      message: 'locked'
    })
  })

  it('cleans up when another window deletes the connection', () => {
    const id = tabs().createERDTab('a')

    useConnectionStore.getState().pruneConnections([conn('b')])

    expect(tabs().getTab(id)).toBeUndefined()
    expect(useConnectionStore.getState().activeConnectionId).toBeNull()
  })
})
