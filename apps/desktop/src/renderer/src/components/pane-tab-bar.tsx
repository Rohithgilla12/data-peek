'use client'

import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tab } from '@/components/tab'
import { useTabStore, useConnectionStore, useSplitStore } from '@/stores'
import { cn } from '@/lib/utils'
import type { PaneNode, PaneLeaf } from '@data-peek/shared'

// Helper to find a pane by ID in the tree
function findPaneById(node: PaneNode, paneId: string): PaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined
  }
  return findPaneById(node.children[0], paneId) || findPaneById(node.children[1], paneId)
}

interface PaneTabBarProps {
  paneId: string
  className?: string
}

export function PaneTabBar({ paneId, className }: PaneTabBarProps) {
  const tabs = useTabStore((s) => s.tabs)
  const closeTab = useTabStore((s) => s.closeTab)
  const pinTab = useTabStore((s) => s.pinTab)
  const unpinTab = useTabStore((s) => s.unpinTab)
  const isTabDirty = useTabStore((s) => s.isTabDirty)
  const createQueryTab = useTabStore((s) => s.createQueryTab)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  // Subscribe to the full layout to get proper reactivity
  const layout = useSplitStore((s) => s.layout)
  const setActivePaneTab = useSplitStore((s) => s.setActivePaneTab)
  const addTabToPane = useSplitStore((s) => s.addTabToPane)
  const removeTabFromPane = useSplitStore((s) => s.removeTabFromPane)
  const splitPane = useSplitStore((s) => s.splitPane)

  // Compute pane from layout (memoized)
  const pane = useMemo(() => findPaneById(layout.root, paneId), [layout.root, paneId])

  // Make this pane a droppable zone for cross-pane tab dragging
  const { setNodeRef, isOver } = useDroppable({
    id: paneId
  })

  // Get tabs for this pane, maintaining order from the global tabs array
  const paneTabs = tabs.filter((t) => pane?.tabIds.includes(t.id))
  const activeTabId = pane?.activeTabId

  const handleNewTab = () => {
    const tabId = createQueryTab(activeConnectionId)
    addTabToPane(tabId, paneId)
  }

  const handleSelectTab = (tabId: string) => {
    setActivePaneTab(paneId, tabId)
  }

  const handleCloseTab = (tabId: string) => {
    removeTabFromPane(tabId)
    closeTab(tabId)
  }

  const handleCloseOthers = (tabId: string) => {
    const otherTabIds = paneTabs.filter((t) => t.id !== tabId && !t.isPinned).map((t) => t.id)
    otherTabIds.forEach((id) => {
      removeTabFromPane(id)
      closeTab(id)
    })
  }

  const handleCloseToRight = (tabId: string) => {
    const tabIndex = paneTabs.findIndex((t) => t.id === tabId)
    const tabsToClose = paneTabs.slice(tabIndex + 1).filter((t) => !t.isPinned)
    tabsToClose.forEach((t) => {
      removeTabFromPane(t.id)
      closeTab(t.id)
    })
  }

  const handleCloseAll = () => {
    const tabsToClose = paneTabs.filter((t) => !t.isPinned)
    tabsToClose.forEach((t) => {
      removeTabFromPane(t.id)
      closeTab(t.id)
    })
  }

  const handleSplitRight = () => {
    splitPane(paneId, 'horizontal')
  }

  const handleSplitDown = () => {
    splitPane(paneId, 'vertical')
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-9 items-center border-b border-border/40 bg-muted/20 overflow-x-auto',
        isOver && 'bg-primary/10 border-primary/40',
        className
      )}
    >
      <SortableContext items={paneTabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        {paneTabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isDirty={isTabDirty(tab.id)}
            onSelect={() => handleSelectTab(tab.id)}
            onClose={() => handleCloseTab(tab.id)}
            onPin={() => pinTab(tab.id)}
            onUnpin={() => unpinTab(tab.id)}
            onCloseOthers={() => handleCloseOthers(tab.id)}
            onCloseToRight={() => handleCloseToRight(tab.id)}
            onCloseAll={handleCloseAll}
            onSplitRight={handleSplitRight}
            onSplitDown={handleSplitDown}
          />
        ))}
      </SortableContext>

      {/* New Tab Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 shrink-0 rounded-none border-r border-border/40 hover:bg-muted/50"
        onClick={handleNewTab}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
