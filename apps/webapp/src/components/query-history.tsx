import { useState, useMemo } from 'react'
import { ChevronRight, Clock, Copy, MoreHorizontal, Play, Trash2, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useQueryStore, useConnectionStore, useTabStore } from '@/stores'
import { QueryHistoryDialog } from './query-history-dialog'
import {
  filterHistory,
  formatRelativeTime,
  truncateQuery,
  getQueryType,
  getQueryTypeColor
} from '@/lib/query-history-utils'

export function QueryHistory() {
  const { isMobile } = useSidebar()
  const history = useQueryStore((s) => s.history)
  const clearHistory = useQueryStore((s) => s.clearHistory)
  const removeFromHistory = useQueryStore((s) => s.removeFromHistory)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const getActiveTab = useTabStore((s) => s.getActiveTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredHistory = useMemo(() => {
    const connectionFiltered = activeConnectionId
      ? history.filter((h) => h.connectionId === activeConnectionId || !h.connectionId)
      : history

    if (!searchQuery.trim()) {
      return connectionFiltered
    }

    return filterHistory(connectionFiltered, {
      searchQuery,
      filterStatus: 'all',
      filterType: 'all',
      connectionId: null
    })
  }, [history, activeConnectionId, searchQuery])

  const displayLimit = searchQuery.trim() ? 20 : 10
  const displayedHistory = filteredHistory.slice(0, displayLimit)

  const handleQueryClick = (query: string) => {
    const activeTab = getActiveTab()
    if (
      activeTabId &&
      activeTab &&
      (activeTab.type === 'query' || activeTab.type === 'table-preview')
    ) {
      updateTabQuery(activeTabId, query)
    } else if (activeConnectionId) {
      createQueryTab(activeConnectionId, query)
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
            <span>History</span>
            {filteredHistory.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[11px] px-1.5 py-0">
                {filteredHistory.length}
              </Badge>
            )}
          </CollapsibleTrigger>
          <SidebarGroupAction
            onClick={(e) => {
              e.stopPropagation()
              clearHistory()
            }}
            title="Clear history"
          >
            <Trash2 className="size-3.5" />
          </SidebarGroupAction>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 size-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            <SidebarMenu>
              {displayedHistory.length === 0 ? (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  {searchQuery
                    ? 'No matching queries'
                    : activeConnectionId
                      ? 'No queries yet'
                      : 'Select a connection'}
                </div>
              ) : (
                displayedHistory.map((item) => {
                  const queryType = getQueryType(item.query)
                  return (
                    <SidebarMenuItem key={item.id}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SidebarMenuButton
                              onClick={() => handleQueryClick(item.query)}
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
                                  <span className="text-xs truncate font-mono">
                                    {truncateQuery(item.query)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="size-3" />
                                    {formatRelativeTime(item.timestamp)}
                                  </span>
                                  {item.status === 'success' ? (
                                    <>
                                      <span>{item.rowCount} rows</span>
                                      <span>{item.durationMs}ms</span>
                                    </>
                                  ) : (
                                    <span className="text-red-400">error</span>
                                  )}
                                </div>
                              </div>
                            </SidebarMenuButton>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-sm">
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                              {item.query}
                            </pre>
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
                          <DropdownMenuItem onClick={() => handleQueryClick(item.query)}>
                            <Play className="text-muted-foreground" />
                            <span>Load in editor</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(item.query)}
                          >
                            <Copy className="text-muted-foreground" />
                            <span>Copy query</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => removeFromHistory(item.id)}
                          >
                            <Trash2 className="text-red-400" />
                            <span>Delete from history</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  )
                })
              )}
              {filteredHistory.length > displayLimit && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsHistoryDialogOpen(true)}
                  >
                    <MoreHorizontal />
                    <span>View all ({filteredHistory.length})</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>

        <QueryHistoryDialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen} />
      </SidebarGroup>
    </Collapsible>
  )
}
