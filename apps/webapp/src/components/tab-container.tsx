import { useEffect, useCallback } from 'react'
import { FileCode, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabBar } from '@/components/tab-bar'
import { TabQueryEditor } from '@/components/tab-query-editor'
import { useTabStore, useConnectionStore } from '@/stores'

export function TabContainer() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const activeTab = useTabStore((s) => s.getActiveTab())

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const handleNewTab = useCallback(() => {
    createQueryTab(activeConnectionId)
  }, [createQueryTab, activeConnectionId])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+T: New tab
      if (isMeta && e.key === 't') {
        e.preventDefault()
        handleNewTab()
        return
      }

      // Cmd+W: Close current tab
      if (isMeta && e.key === 'w' && activeTabId) {
        e.preventDefault()
        closeTab(activeTabId)
        return
      }

      // Cmd+1-9: Switch to tab N
      if (isMeta && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex].id)
        }
        return
      }

      // Cmd+Option+ArrowRight: Next tab
      // Cmd+Option+ArrowLeft: Previous tab
      if (
        isMeta &&
        e.altKey &&
        (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
        tabs.length > 1 &&
        activeTabId
      ) {
        e.preventDefault()
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
        let nextIndex: number

        if (e.key === 'ArrowLeft') {
          // Previous tab
          nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
        } else {
          // Next tab
          nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1
        }

        setActiveTab(tabs[nextIndex].id)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activeTabId, handleNewTab, closeTab, setActiveTab])

  // Empty state - no tabs open
  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4">
            <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <FileCode className="size-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium">No tabs open</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Click the + button or select a table to get started
              </p>
            </div>
            <Button onClick={handleNewTab} className="gap-2">
              <Plus className="size-4" />
              New Query
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabBar />
      {activeTab && <TabQueryEditor key={activeTab.id} tabId={activeTab.id} />}
    </div>
  )
}
