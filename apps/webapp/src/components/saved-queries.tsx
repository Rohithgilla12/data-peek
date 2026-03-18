import { useState, useEffect } from 'react'
import { Bookmark, ChevronRight, MoreHorizontal, Play, Copy, Trash2, Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSavedQueryStore, useConnectionStore, useTabStore } from '@/stores'
import { SavedQueriesDialog } from './saved-queries-dialog'
import { SaveQueryDialog } from './save-query-dialog'
import type { SavedQuery } from '@shared/index'

function truncateQuery(query: string, maxLength: number = 40): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.substring(0, maxLength) + '...'
}

function getQueryType(query: string): string {
  const normalized = query.trim().toUpperCase()
  if (normalized.startsWith('SELECT')) return 'SELECT'
  if (normalized.startsWith('INSERT')) return 'INSERT'
  if (normalized.startsWith('UPDATE')) return 'UPDATE'
  if (normalized.startsWith('DELETE')) return 'DELETE'
  if (normalized.startsWith('CREATE')) return 'CREATE'
  if (normalized.startsWith('ALTER')) return 'ALTER'
  if (normalized.startsWith('DROP')) return 'DROP'
  return 'SQL'
}

function getQueryTypeColor(type: string): string {
  switch (type) {
    case 'SELECT':
      return 'bg-blue-500/10 text-blue-500'
    case 'INSERT':
      return 'bg-green-500/10 text-green-500'
    case 'UPDATE':
      return 'bg-yellow-500/10 text-yellow-500'
    case 'DELETE':
      return 'bg-red-500/10 text-red-500'
    case 'CREATE':
    case 'ALTER':
    case 'DROP':
      return 'bg-purple-500/10 text-purple-500'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function SavedQueries() {
  const { isMobile } = useSidebar()
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const isInitialized = useSavedQueryStore((s) => s.isInitialized)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const deleteSavedQuery = useSavedQueryStore((s) => s.deleteSavedQuery)
  const incrementUsage = useSavedQueryStore((s) => s.incrementUsage)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingQuery, setEditingQuery] = useState<SavedQuery | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initializeSavedQueries()
    }
  }, [isInitialized, initializeSavedQueries])

  // Listen for menu shortcut to open dialog
  useEffect(() => {
    const unsubscribe = window.api.savedQueries.onOpenDialog(() => {
      setIsDialogOpen(true)
    })
    return unsubscribe
  }, [])

  // Sort by last used, then by usage count
  const sortedQueries = [...savedQueries].sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) {
      return b.lastUsedAt - a.lastUsedAt
    }
    if (a.lastUsedAt) return -1
    if (b.lastUsedAt) return 1
    return b.usageCount - a.usageCount
  })

  const handleLoadQuery = (query: SavedQuery) => {
    const targetConnectionId = query.connectionId || activeConnectionId
    if (!targetConnectionId) return

    const tabId = createQueryTab(targetConnectionId)
    updateTabQuery(tabId, query.query)
    incrementUsage(query.id)
  }

  const handleEditQuery = (query: SavedQuery) => {
    setEditingQuery(query)
    setIsEditDialogOpen(true)
  }

  const handleDeleteQuery = async (id: string) => {
    if (confirm('Are you sure you want to delete this saved query?')) {
      await deleteSavedQuery(id)
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1">
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <span>Saved Queries</span>
            {sortedQueries.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[11px] px-1.5 py-0">
                {sortedQueries.length}
              </Badge>
            )}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedQueries.length === 0 ? (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  No saved queries yet
                </div>
              ) : (
                sortedQueries.slice(0, 5).map((item) => {
                  const queryType = getQueryType(item.query)
                  return (
                    <SidebarMenuItem key={item.id}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SidebarMenuButton
                              onClick={() => handleLoadQuery(item)}
                              className="h-auto py-1.5"
                            >
                              <div className="flex flex-col items-start gap-0.5 w-full min-w-0">
                                <div className="flex items-center gap-1.5 w-full">
                                  <Badge
                                    variant="outline"
                                    className={`text-[11px] px-1.5 py-0 shrink-0 ${getQueryTypeColor(queryType)}`}
                                  >
                                    {queryType}
                                  </Badge>
                                  <span className="text-xs truncate font-medium">{item.name}</span>
                                </div>
                                <span className="text-[11px] text-muted-foreground font-mono truncate w-full">
                                  {truncateQuery(item.query)}
                                </span>
                              </div>
                            </SidebarMenuButton>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-sm">
                            <div className="space-y-1">
                              <p className="font-medium">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                              <pre className="text-xs font-mono whitespace-pre-wrap">
                                {item.query}
                              </pre>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
                          <DropdownMenuItem onClick={() => handleLoadQuery(item)}>
                            <Play className="text-muted-foreground" />
                            <span>Open in new tab</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(item.query)}
                          >
                            <Copy className="text-muted-foreground" />
                            <span>Copy query</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditQuery(item)}>
                            <Pencil className="text-muted-foreground" />
                            <span>Edit</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleDeleteQuery(item.id)}
                          >
                            <Trash2 className="text-red-400" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  )
                })
              )}
              {sortedQueries.length > 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <Bookmark className="size-4" />
                    <span>View all ({sortedQueries.length})</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {sortedQueries.length > 0 && sortedQueries.length <= 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <MoreHorizontal className="size-4" />
                    <span>Manage saved queries</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>

        <SavedQueriesDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onEditQuery={(query) => {
            setIsDialogOpen(false)
            handleEditQuery(query)
          }}
        />

        {editingQuery && (
          <SaveQueryDialog
            open={isEditDialogOpen}
            onOpenChange={(open) => {
              setIsEditDialogOpen(open)
              if (!open) setEditingQuery(null)
            }}
            query={editingQuery.query}
            editingQuery={editingQuery}
          />
        )}
      </SidebarGroup>
    </Collapsible>
  )
}
