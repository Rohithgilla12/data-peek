import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabStore } from '../tab-store'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

vi.stubGlobal('window', {
  api: { db: { cancelQuery: vi.fn().mockResolvedValue({ success: true }) } }
})

const focusRequest = () => useTabStore.getState().focusRequest

describe('focusRequest', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null, focusRequest: 0 })
  })

  it('bumps when a tab is created', () => {
    useTabStore.getState().createTablePreviewTab('conn', 'public', 'users')
    useTabStore.getState().createQueryTab('conn')
    useTabStore.getState().createAskTab('conn')
    expect(focusRequest()).toBe(3)
  })

  it('bumps when an existing tab is re-focused, even if it is already active', () => {
    const id = useTabStore.getState().createERDTab('conn')
    useTabStore.getState().createERDTab('conn')
    useTabStore.getState().setActiveTab(id)
    expect(focusRequest()).toBe(3)
  })

  it('does not bump on background updates or closing tabs', () => {
    const a = useTabStore.getState().createQueryTab('conn', 'SELECT 1')
    const b = useTabStore.getState().createQueryTab('conn', 'SELECT 2')
    const before = focusRequest()

    useTabStore.getState().updateTabQuery(a, 'SELECT 3')
    useTabStore.getState().updateTabResult(a, null, 'boom')
    useTabStore.getState().closeTab(b)

    expect(focusRequest()).toBe(before)
  })
})
