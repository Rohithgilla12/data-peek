import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabStore } from '../tab-store'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

// Stub window.api so closeTab can fire the cancel call.
const cancelSpy = vi.fn().mockResolvedValue({ success: true, data: { cancelled: true } })

vi.stubGlobal('window', {
  api: {
    db: {
      cancelQuery: cancelSpy
    }
  }
})

describe('updateTabExecuting compare-and-swap by executionId', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
    cancelSpy.mockClear()
  })

  it('refuses to flip isExecuting when expectedExecutionId does not match the live one', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT 1')
    useTabStore.getState().updateTabExecuting(tabId, true, 'exec-A')

    // A stale "finally" from execution B tries to clear the flag.
    useTabStore.getState().updateTabExecuting(tabId, false, undefined, 'exec-B')

    const tab = useTabStore.getState().getTab(tabId)
    expect(tab && 'isExecuting' in tab && tab.isExecuting).toBe(true)
    expect(tab && 'executionId' in tab && tab.executionId).toBe('exec-A')
  })

  it('flips isExecuting when expectedExecutionId matches', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT 1')
    useTabStore.getState().updateTabExecuting(tabId, true, 'exec-A')

    useTabStore.getState().updateTabExecuting(tabId, false, undefined, 'exec-A')

    const tab = useTabStore.getState().getTab(tabId)
    expect(tab && 'isExecuting' in tab && tab.isExecuting).toBe(false)
    expect(tab && 'executionId' in tab && tab.executionId).toBe(null)
  })

  it('still works without expectedExecutionId for backwards compatibility', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT 1')
    useTabStore.getState().updateTabExecuting(tabId, true, 'exec-A')

    useTabStore.getState().updateTabExecuting(tabId, false)

    const tab = useTabStore.getState().getTab(tabId)
    expect(tab && 'isExecuting' in tab && tab.isExecuting).toBe(false)
  })
})

describe('closeTab cancels in-flight queries', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
    cancelSpy.mockClear()
  })

  it('fires cancelQuery when closing a tab that is executing', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT pg_sleep(60)')
    useTabStore.getState().updateTabExecuting(tabId, true, 'long-running-exec')

    useTabStore.getState().closeTab(tabId)

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith('long-running-exec')
  })

  it('does not call cancelQuery when closing an idle tab', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT 1')

    useTabStore.getState().closeTab(tabId)

    expect(cancelSpy).not.toHaveBeenCalled()
  })

  it('does not call cancelQuery when closeTab is a no-op (pinned tab)', () => {
    const tabId = useTabStore.getState().createQueryTab(null, 'SELECT 1')
    useTabStore.getState().pinTab(tabId)
    useTabStore.getState().updateTabExecuting(tabId, true, 'exec-X')

    useTabStore.getState().closeTab(tabId)

    expect(cancelSpy).not.toHaveBeenCalled()
    // Tab still present
    expect(useTabStore.getState().getTab(tabId)).toBeDefined()
  })
})
