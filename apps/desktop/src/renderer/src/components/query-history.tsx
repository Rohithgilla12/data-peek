'use client'

import { useState } from 'react'
import { Clock, Copy, MoreHorizontal, Play, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

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

  // Filter history by active connection
  const filteredHistory = activeConnectionId
    ? history.filter((h) => h.connectionId === activeConnectionId || !h.connectionId)
    : history

  const handleQueryClick = (query: string) => {
    const activeTab = getActiveTab()
    // If there's an active query/table-preview tab, update it
    if (activeTabId && activeTab && (activeTab.type === 'query' || activeTab.type === 'table-preview')) {
      updateTabQuery(activeTabId, query)
    } else if (activeConnectionId) {
      // Otherwise create a new tab with the query
      createQueryTab(activeConnectionId, query)
    }
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        History
        <SidebarGroupAction onClick={clearHistory} title="Clear history">
          <Trash2 className="size-3.5" />
        </SidebarGroupAction>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {filteredHistory.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
              {activeConnectionId ? 'No queries yet' : 'Select a connection'}
            </div>
          ) : (
            filteredHistory.slice(0, 10).map((item) => {
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
                                className={`text-[9px] px-1 py-0 shrink-0 ${getQueryTypeColor(queryType)}`}
                              >
                                {queryType}
                              </Badge>
                              <span className="text-xs truncate font-mono">
                                {truncateQuery(item.query)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Clock className="size-2.5" />
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
                        <pre className="text-xs font-mono whitespace-pre-wrap">{item.query}</pre>
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
                      <DropdownMenuItem onClick={() => navigator.clipboard.writeText(item.query)}>
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
                <span>View all history ({filteredHistory.length})</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>

      <QueryHistoryDialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen} />
    </SidebarGroup>
  )
}
