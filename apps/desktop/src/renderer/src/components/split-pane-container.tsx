'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import type { PaneNode } from '@data-peek/shared'
import { useSplitStore, useTabStore } from '@/stores'
import { PaneView } from '@/components/pane-view'
import { cn } from '@/lib/utils'
import { FileCode, Table2, Network } from 'lucide-react'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
}

function ResizeHandle({ direction }: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      className={cn(
        'relative flex items-center justify-center transition-colors',
        'hover:bg-primary/20 active:bg-primary/30',
        'data-[resize-handle-state=drag]:bg-primary/30',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:w-1.5 data-[resize-handle-state=drag]:w-1.5'
          : 'h-1 cursor-row-resize hover:h-1.5 data-[resize-handle-state=drag]:h-1.5'
      )}
    >
      <div
        className={cn(
          'absolute bg-border/60 rounded-full transition-all',
          'group-hover:bg-primary/40',
          direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'
        )}
      />
    </PanelResizeHandle>
  )
}

interface PaneNodeRendererProps {
  node: PaneNode
  autoSaveIdPrefix: string
}

function PaneNodeRenderer({ node, autoSaveIdPrefix }: PaneNodeRendererProps) {
  const updatePaneSizes = useSplitStore((s) => s.updatePaneSizes)

  if (node.type === 'leaf') {
    return <PaneView paneId={node.id} />
  }

  const handleResize = (sizes: number[]) => {
    if (sizes.length === 2) {
      updatePaneSizes(node.id, [sizes[0], sizes[1]])
    }
  }

  return (
    <PanelGroup
      direction={node.direction}
      autoSaveId={`${autoSaveIdPrefix}-${node.id}`}
      onLayout={handleResize}
    >
      <Panel defaultSize={node.sizes[0]} minSize={10}>
        <PaneNodeRenderer node={node.children[0]} autoSaveIdPrefix={autoSaveIdPrefix} />
      </Panel>
      <ResizeHandle direction={node.direction} />
      <Panel defaultSize={node.sizes[1]} minSize={10}>
        <PaneNodeRenderer node={node.children[1]} autoSaveIdPrefix={autoSaveIdPrefix} />
      </Panel>
    </PanelGroup>
  )
}

// DragOverlay content for dragging tabs
function DragOverlayContent({ tabId }: { tabId: string }) {
  const tabs = useTabStore((s) => s.tabs)
  const tab = tabs.find((t) => t.id === tabId)

  if (!tab) return null

  const Icon = tab.type === 'query' ? FileCode : tab.type === 'erd' ? Network : Table2

  return (
    <div className="flex h-9 min-w-[100px] max-w-[180px] items-center gap-2 border border-border/40 bg-background px-3 shadow-lg rounded">
      <Icon
        className={cn(
          'size-4 shrink-0',
          tab.type === 'table-preview'
            ? 'text-blue-500'
            : tab.type === 'erd'
              ? 'text-purple-500'
              : 'text-muted-foreground'
        )}
      />
      <span className="truncate text-sm">{tab.title}</span>
    </div>
  )
}

export function SplitPaneContainer() {
  const layout = useSplitStore((s) => s.layout)
  const tabs = useTabStore((s) => s.tabs)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const moveTabToPane = useSplitStore((s) => s.moveTabToPane)
  const getTabPane = useSplitStore((s) => s.getTabPane)

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeTabId = active.id as string
    const overId = over.id as string

    // Check if dropped on a pane (droppable zone)
    if (overId.startsWith('pane-')) {
      const targetPaneId = overId
      const sourcePaneId = getTabPane(activeTabId)

      if (sourcePaneId && sourcePaneId !== targetPaneId) {
        moveTabToPane(activeTabId, targetPaneId)
      }
      return
    }

    // Check if dropped on another tab (reorder within same pane)
    if (active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id)
      const newIndex = tabs.findIndex((t) => t.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        // Check if both tabs are in the same pane
        const activePaneId = getTabPane(activeTabId)
        const overPaneId = getTabPane(overId)

        if (activePaneId === overPaneId) {
          // Prevent moving unpinned tabs before pinned tabs
          const pinnedCount = tabs.filter((t) => t.isPinned).length
          if (!tabs[oldIndex].isPinned && newIndex < pinnedCount) {
            return
          }
          if (tabs[oldIndex].isPinned && newIndex >= pinnedCount) {
            return
          }
          reorderTabs(oldIndex, newIndex)
        } else if (overPaneId) {
          // Cross-pane drop on a tab - move to that pane
          moveTabToPane(activeTabId, overPaneId)
        }
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <PaneNodeRenderer node={layout.root} autoSaveIdPrefix="data-peek-panels" />
      </div>
      <DragOverlay>{activeId ? <DragOverlayContent tabId={activeId} /> : null}</DragOverlay>
    </DndContext>
  )
}
