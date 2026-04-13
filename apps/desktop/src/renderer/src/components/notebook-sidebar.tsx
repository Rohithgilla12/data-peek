import { useState, useEffect } from 'react'
import { BookOpen, ChevronRight, Plus, MoreHorizontal, Trash2, FolderOpen } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@data-peek/ui'

import { useNotebookStore } from '@/stores/notebook-store'
import { useConnectionStore, useTabStore } from '@/stores'
import type { Notebook } from '@shared/index'

export function NotebookSidebar() {
  const { isMobile } = useSidebar()
  const notebooks = useNotebookStore((s) => s.notebooks)
  const isInitialized = useNotebookStore((s) => s.isInitialized)
  const initialize = useNotebookStore((s) => s.initialize)
  const createNotebook = useNotebookStore((s) => s.createNotebook)
  const deleteNotebook = useNotebookStore((s) => s.deleteNotebook)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const createNotebookTab = useTabStore((s) => s.createNotebookTab)

  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  const handleCreate = async () => {
    if (!activeConnectionId) return
    const nb = await createNotebook({ title: 'Untitled Notebook', connectionId: activeConnectionId })
    if (nb) {
      createNotebookTab(nb.connectionId, nb.id, nb.title)
    }
  }

  const handleOpen = (nb: Notebook) => {
    createNotebookTab(nb.connectionId, nb.id, nb.title)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this notebook?')) {
      await deleteNotebook(id)
    }
  }

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }

  const ungrouped = notebooks.filter((nb) => !nb.folder)
  const folderMap = new Map<string, Notebook[]>()
  for (const nb of notebooks) {
    if (nb.folder) {
      const existing = folderMap.get(nb.folder) ?? []
      existing.push(nb)
      folderMap.set(nb.folder, existing)
    }
  }
  const folders = Array.from(folderMap.keys()).sort()

  const renderNotebookItem = (nb: Notebook) => (
    <SidebarMenuItem key={nb.id}>
      <SidebarMenuButton onClick={() => handleOpen(nb)} className="h-auto py-1.5">
        <BookOpen className="size-4 shrink-0" />
        <span className="text-xs truncate">{nb.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48 rounded-lg"
          side={isMobile ? 'bottom' : 'right'}
          align={isMobile ? 'end' : 'start'}
        >
          <DropdownMenuItem onClick={() => handleOpen(nb)}>
            <BookOpen className="text-muted-foreground" />
            <span>Open notebook</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-400" onClick={() => handleDelete(nb.id)}>
            <Trash2 className="text-red-400" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1">
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <span>Notebooks</span>
          </CollapsibleTrigger>
          <SidebarGroupAction
            onClick={(e) => {
              e.stopPropagation()
              handleCreate()
            }}
            title="New notebook"
          >
            <Plus className="size-3.5" />
          </SidebarGroupAction>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {notebooks.length === 0 ? (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  <button
                    onClick={handleCreate}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Create your first notebook
                  </button>
                </div>
              ) : (
                <>
                  {ungrouped.map(renderNotebookItem)}

                  {folders.map((folder) => {
                    const folderNotebooks = folderMap.get(folder) ?? []
                    const isFolderExpanded = expandedFolders.has(folder)
                    return (
                      <Collapsible
                        key={folder}
                        open={isFolderExpanded}
                        onOpenChange={() => toggleFolder(folder)}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton className="h-auto py-1.5">
                              <FolderOpen className="size-4 shrink-0" />
                              <span className="text-xs truncate flex-1">{folder}</span>
                              <ChevronRight
                                className={`size-3 transition-transform ml-auto ${isFolderExpanded ? 'rotate-90' : ''}`}
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                        </SidebarMenuItem>
                        <CollapsibleContent>
                          <SidebarMenu className="pl-4">
                            {folderNotebooks.map(renderNotebookItem)}
                          </SidebarMenu>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
