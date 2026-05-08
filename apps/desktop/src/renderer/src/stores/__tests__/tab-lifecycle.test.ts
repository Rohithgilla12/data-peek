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
    expect(useTabStore.getState().getTab(tabId)).toBeDefined()
  })

  it('closeAllTabs cancels every executing non-pinned tab', () => {
    const a = useTabStore.getState().createQueryTab(null, 'SELECT 1')
    const b = useTabStore.getState().createQueryTab(null, 'SELECT 2')
    const idle = useTabStore.getState().createQueryTab(null, 'SELECT 3')
    useTabStore.getState().updateTabExecuting(a, true, 'exec-a')
    useTabStore.getState().updateTabExecuting(b, true, 'exec-b')

    useTabStore.getState().closeAllTabs()

    expect(cancelSpy).toHaveBeenCalledTimes(2)
    expect(cancelSpy).toHaveBeenCalledWith('exec-a')
    expect(cancelSpy).toHaveBeenCalledWith('exec-b')
    expect(useTabStore.getState().getTab(idle)).toBeUndefined()
  })

  it('closeOtherTabs cancels other executing tabs but leaves the kept tab alone', () => {
    const keep = useTabStore.getState().createQueryTab(null, 'SELECT keep')
    const other = useTabStore.getState().createQueryTab(null, 'SELECT other')
    useTabStore.getState().updateTabExecuting(keep, true, 'exec-keep')
    useTabStore.getState().updateTabExecuting(other, true, 'exec-other')

    useTabStore.getState().closeOtherTabs(keep)

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith('exec-other')
    expect(useTabStore.getState().getTab(keep)).toBeDefined()
  })

  it('closeTabsToRight cancels only the tabs to the right that are executing', () => {
    const left = useTabStore.getState().createQueryTab(null, 'SELECT left')
    const middle = useTabStore.getState().createQueryTab(null, 'SELECT middle')
    const right = useTabStore.getState().createQueryTab(null, 'SELECT right')
    useTabStore.getState().updateTabExecuting(left, true, 'exec-left')
    useTabStore.getState().updateTabExecuting(middle, true, 'exec-middle')
    useTabStore.getState().updateTabExecuting(right, true, 'exec-right')

    useTabStore.getState().closeTabsToRight(middle)

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith('exec-right')
    expect(useTabStore.getState().getTab(left)).toBeDefined()
    expect(useTabStore.getState().getTab(middle)).toBeDefined()
    expect(useTabStore.getState().getTab(right)).toBeUndefined()
  })
})
