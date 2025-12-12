'use client'

import { useCallback, useMemo } from 'react'
import { FileCode, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PaneTabBar } from '@/components/pane-tab-bar'
import { TabQueryEditor } from '@/components/tab-query-editor'
import { useSplitStore, useTabStore, useConnectionStore } from '@/stores'
import { cn } from '@/lib/utils'
import type { PaneNode, PaneLeaf } from '@data-peek/shared'

// Helper to find a pane by ID in the tree
function findPaneById(node: PaneNode, paneId: string): PaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined
  }
  return findPaneById(node.children[0], paneId) || findPaneById(node.children[1], paneId)
}

interface PaneViewProps {
  paneId: string
}

export function PaneView({ paneId }: PaneViewProps) {
  // Subscribe to the full layout to get proper reactivity
  const layout = useSplitStore((s) => s.layout)
  const focusPane = useSplitStore((s) => s.focusPane)
  const addTabToPane = useSplitStore((s) => s.addTabToPane)

  // Compute pane from layout (memoized)
  const pane = useMemo(() => findPaneById(layout.root, paneId), [layout.root, paneId])
  const focusedPaneId = layout.focusedPaneId

  const tabs = useTabStore((s) => s.tabs)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const isFocused = focusedPaneId === paneId

  const handleFocus = useCallback(() => {
    if (!isFocused) {
      focusPane(paneId)
    }
  }, [isFocused, focusPane, paneId])

  const handleNewTab = useCallback(() => {
    const tabId = createQueryTab(activeConnectionId)
    addTabToPane(tabId, paneId)
  }, [createQueryTab, activeConnectionId, addTabToPane, paneId])

  // Get tabs for this pane
  const paneTabs = tabs.filter((t) => pane?.tabIds.includes(t.id))
  const activeTab = paneTabs.find((t) => t.id === pane?.activeTabId)

  // Empty state - no tabs in this pane
  if (paneTabs.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden',
          isFocused && 'ring-1 ring-primary/30 ring-inset'
        )}
        onClick={handleFocus}
      >
        <PaneTabBar paneId={paneId} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4">
            <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <FileCode className="size-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium">No tabs open</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Click the + button or drag a tab here
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
    <div
      className={cn(
        'flex flex-1 flex-col overflow-hidden',
        isFocused && 'ring-1 ring-primary/30 ring-inset'
      )}
      onClick={handleFocus}
    >
      <PaneTabBar paneId={paneId} />
      {activeTab && <TabQueryEditor key={activeTab.id} tabId={activeTab.id} />}
    </div>
  )
}
