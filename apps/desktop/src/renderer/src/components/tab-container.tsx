import { useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@data-peek/ui'
import { TabBar } from '@/components/tab-bar'
import { TabQueryEditor } from '@/components/tab-query-editor'
import { NotebookEditor } from '@/components/notebook-editor'
import { useTabStore, useConnectionStore } from '@/stores'
import { useHotkeys, type UseHotkeyDefinition, type Hotkey } from '@tanstack/react-hotkeys'
import type { NotebookTab } from '@/stores/tab-store'

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
  const tabHotkeys = useMemo<UseHotkeyDefinition[]>(
    () => [
      { hotkey: 'Mod+T', callback: handleNewTab },
      {
        hotkey: 'Mod+W',
        callback: () => {
          if (activeTabId) closeTab(activeTabId)
        }
      },
      {
        hotkey: 'Mod+Alt+ArrowRight',
        callback: () => {
          if (tabs.length <= 1 || !activeTabId) return
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1
          setActiveTab(tabs[nextIndex].id)
        }
      },
      {
        hotkey: 'Mod+Alt+ArrowLeft',
        callback: () => {
          if (tabs.length <= 1 || !activeTabId) return
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
          setActiveTab(tabs[nextIndex].id)
        }
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        hotkey: `Mod+${i + 1}` as Hotkey,
        callback: () => {
          if (tabs[i]) setActiveTab(tabs[i].id)
        }
      }))
    ],
    [tabs, activeTabId, handleNewTab, closeTab, setActiveTab]
  )
  useHotkeys(tabHotkeys)

  // Empty state - no tabs open
  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-3">
            <h2 className="text-lg font-medium">Ready to query</h2>
            <p className="text-sm text-muted-foreground">
              Open a new tab or select a table from the sidebar
            </p>
            <Button onClick={handleNewTab} className="gap-2">
              <Plus className="size-4" />
              New Query
              <kbd className="ml-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                {window.electron.process.platform === 'darwin' ? '⌘' : 'Ctrl+'}T
              </kbd>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabBar />
      {activeTab && activeTab.type === 'notebook' ? (
        <NotebookEditor key={activeTab.id} tab={activeTab as NotebookTab} />
      ) : (
        activeTab && <TabQueryEditor key={activeTab.id} tabId={activeTab.id} />
      )}
    </div>
  )
}
