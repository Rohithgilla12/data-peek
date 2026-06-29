import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, Clock, Copy, MoreHorizontal, Play, Trash2 } from 'lucide-react'

import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

import { useQueryStore, useConnectionStore, useTabStore } from '@/stores'
import { QueryHistoryDialog } from './query-history-dialog'
import {
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
  const loadHistory = useQueryStore((s) => s.loadHistory)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const getActiveTab = useTabStore((s) => s.getActiveTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Load persisted history once on mount so it survives app restarts.
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredHistory = useMemo(() => {
    return activeConnectionId
      ? history.filter((h) => h.connectionId === activeConnectionId || !h.connectionId)
      : history
  }, [history, activeConnectionId])

  const displayedHistory = filteredHistory.slice(0, 10)

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
            <SidebarMenu>
              {displayedHistory.length === 0 ? (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  {activeConnectionId ? 'No queries yet' : 'Select a connection'}
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
              {filteredHistory.length > 10 && (
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
