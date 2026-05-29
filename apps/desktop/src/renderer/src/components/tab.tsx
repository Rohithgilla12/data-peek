import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileCode, Table2, Pin, X, Network, SearchCode } from 'lucide-react'
import { cn, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@data-peek/ui'
import type { Tab as TabType } from '@/stores/tab-store'
import { useTabStore } from '@/stores/tab-store'
import { useWatchStore } from '@/stores/watch-store'

interface TabProps {
  tab: TabType
  isActive: boolean
  isDirty: boolean
  onSelect: () => void
  onClose: () => void
  onPin: () => void
  onUnpin: () => void
  onCloseOthers: () => void
  onCloseToRight: () => void
  onCloseAll: () => void
}

export function Tab({
  tab,
  isActive,
  isDirty,
  onSelect,
  onClose,
  onPin,
  onUnpin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll
}: TabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id
  })
  const watchState = useWatchStore((s) => s.states[tab.id])
  const isWatching = !!watchState?.enabled
  const isPaused = !!watchState?.paused

  const setTabName = useTabStore((s) => s.setTabName)
  const clearTabName = useTabStore((s) => s.clearTabName)
  const isQuery = tab.type === 'query'
  const refName = isQuery ? tab.name : undefined
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const Icon =
    tab.type === 'query'
      ? FileCode
      : tab.type === 'erd'
        ? Network
        : tab.type === 'schema-intel'
          ? SearchCode
          : Table2

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          className={cn(
            'group relative flex h-9 min-w-[100px] max-w-[180px] cursor-pointer items-center gap-2 border-r border-border/40 px-3 transition-colors',
            isActive
              ? 'bg-background border-b-2 border-b-primary'
              : 'bg-muted/30 hover:bg-muted/50',
            isDragging && 'opacity-50',
            tab.isPinned && 'bg-muted/40'
          )}
        >
          {/* Pin indicator */}
          {tab.isPinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}

          {/* Tab icon */}
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

          {/* Dirty indicator */}
          {isDirty && <span className="size-2 shrink-0 rounded-full bg-yellow-500" />}

          {/* Watching indicator — pulses while polling, dimmed when paused */}
          {isWatching && (
            <span
              aria-label={isPaused ? 'Watch paused' : 'Watching'}
              className={cn(
                'relative inline-flex size-2 shrink-0 items-center justify-center',
                isPaused && 'opacity-50'
              )}
            >
              {!isPaused && (
                <span className="absolute inline-flex size-2 rounded-full bg-amber-500/40 motion-safe:animate-ping" />
              )}
              <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
            </span>
          )}

          {/* Title */}
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value)
                setNameError(null)
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  const res = setTabName(tab.id, nameDraft)
                  if (res.ok) setRenaming(false)
                  else setNameError('Invalid or duplicate name')
                } else if (e.key === 'Escape') {
                  setRenaming(false)
                }
              }}
              onBlur={() => setRenaming(false)}
              placeholder="name"
              className={cn(
                'w-24 bg-transparent text-sm outline-none border-b',
                nameError ? 'border-red-500' : 'border-primary/50'
              )}
            />
          ) : refName ? (
            <span className="truncate text-sm">
              <span className="text-primary">@{refName}</span>
            </span>
          ) : (
            <span className="truncate text-sm">{tab.title}</span>
          )}

          {/* Close button (hidden for pinned tabs) */}
          {!tab.isPinned && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {tab.isPinned ? (
          <ContextMenuItem onClick={onUnpin}>
            <Pin className="mr-2 size-4" />
            Unpin Tab
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={onPin}>
            <Pin className="mr-2 size-4" />
            Pin Tab
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {isQuery && (
          <ContextMenuItem
            onClick={() => {
              setNameDraft(refName ?? '')
              setNameError(null)
              setRenaming(true)
            }}
          >
            Name as @…
          </ContextMenuItem>
        )}
        {isQuery && refName && (
          <ContextMenuItem onClick={() => clearTabName(tab.id)}>Clear @name</ContextMenuItem>
        )}
        {isQuery && <ContextMenuSeparator />}
        {!tab.isPinned && (
          <ContextMenuItem onClick={onClose}>
            <X className="mr-2 size-4" />
            Close Tab
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onCloseOthers}>Close Other Tabs</ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight}>Close Tabs to Right</ContextMenuItem>
        <ContextMenuItem onClick={onCloseAll}>Close All Tabs</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
