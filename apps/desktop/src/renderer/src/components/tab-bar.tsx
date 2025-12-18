import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tab } from '@/components/tab'
import { useTabStore, useConnectionStore } from '@/stores'
import { cn } from '@/lib/utils'

interface TabBarProps {
  className?: string
}

export function TabBar({ className }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight)
  const closeAllTabs = useTabStore((s) => s.closeAllTabs)
  const pinTab = useTabStore((s) => s.pinTab)
  const unpinTab = useTabStore((s) => s.unpinTab)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const isTabDirty = useTabStore((s) => s.isTabDirty)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tabs.findIndex((t) => t.id === active.id)
    const newIndex = tabs.findIndex((t) => t.id === over.id)

    // Prevent moving unpinned tabs before pinned tabs
    const pinnedCount = tabs.filter((t) => t.isPinned).length
    if (!tabs[oldIndex].isPinned && newIndex < pinnedCount) {
      return
    }

    // Prevent moving pinned tabs after unpinned tabs
    if (tabs[oldIndex].isPinned && newIndex >= pinnedCount) {
      return
    }

    reorderTabs(oldIndex, newIndex)
  }

  const handleNewTab = () => {
    createQueryTab(activeConnectionId)
  }

  return (
    <div
      className={cn(
        'flex h-9 items-center border-b border-border/40 bg-muted/20 overflow-x-auto',
        className
      )}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isDirty={isTabDirty(tab.id)}
              onSelect={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onPin={() => pinTab(tab.id)}
              onUnpin={() => unpinTab(tab.id)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
              onCloseToRight={() => closeTabsToRight(tab.id)}
              onCloseAll={closeAllTabs}
            />
          ))}
        </SortableContext>
      </DndContext>

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
