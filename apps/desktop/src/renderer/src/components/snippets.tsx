import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, Code2, Copy, MoreHorizontal, Play, Plus, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useSnippetStore, useConnectionStore, useTabStore } from '@/stores'
import { getSnippetCategoryColor, cleanSnippetTemplate } from '@/lib/built-in-snippets'
import { SnippetsDialog } from './snippets-dialog'
import { CreateSnippetDialog } from './create-snippet-dialog'

export function Snippets() {
  const { isMobile } = useSidebar()
  const initializeSnippets = useSnippetStore((s) => s.initializeSnippets)
  const getAllSnippets = useSnippetStore((s) => s.getAllSnippets)
  const searchSnippets = useSnippetStore((s) => s.searchSnippets)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const getActiveTab = useTabStore((s) => s.getActiveTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)

  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSnippetsDialogOpen, setIsSnippetsDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  useEffect(() => {
    initializeSnippets()
  }, [initializeSnippets])

  const allSnippets = getAllSnippets()

  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) {
      return allSnippets
    }
    return searchSnippets(searchQuery)
  }, [allSnippets, searchQuery, searchSnippets])

  const displayLimit = searchQuery.trim() ? 20 : 10
  const displayedSnippets = filteredSnippets.slice(0, displayLimit)

  const handleSnippetClick = (template: string) => {
    const cleanedTemplate = cleanSnippetTemplate(template)
    const activeTab = getActiveTab()

    if (
      activeTabId &&
      activeTab &&
      (activeTab.type === 'query' || activeTab.type === 'table-preview')
    ) {
      const currentQuery = activeTab.query || ''
      const newQuery = currentQuery ? `${currentQuery}\n\n${cleanedTemplate}` : cleanedTemplate
      updateTabQuery(activeTabId, newQuery)
    } else if (activeConnectionId) {
      createQueryTab(activeConnectionId, cleanedTemplate)
    }
  }

  const handleCopySnippet = (template: string) => {
    const cleanedTemplate = cleanSnippetTemplate(template)
    navigator.clipboard.writeText(cleanedTemplate)
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1">
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <span>Snippets</span>
            {allSnippets.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[11px] px-1.5 py-0">
                {allSnippets.length}
              </Badge>
            )}
          </CollapsibleTrigger>
          <SidebarGroupAction
            onClick={(e) => {
              e.stopPropagation()
              setIsCreateDialogOpen(true)
            }}
            title="Create snippet"
          >
            <Plus className="size-3.5" />
          </SidebarGroupAction>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search snippets..."
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
              {displayedSnippets.length === 0 ? (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  {searchQuery ? 'No matching snippets' : 'No snippets available'}
                </div>
              ) : (
                displayedSnippets.map((snippet) => (
                  <SidebarMenuItem key={snippet.id}>
                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            onClick={() => handleSnippetClick(snippet.template)}
                            className="h-auto py-2 hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex flex-col items-start gap-1 w-full min-w-0">
                              <div className="flex items-center gap-2 w-full">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0.5 font-medium shrink-0 border-0 ${getSnippetCategoryColor(snippet.category)}`}
                                >
                                  {snippet.category.toUpperCase()}
                                </Badge>
                                <span className="text-xs font-medium truncate">{snippet.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 pl-0.5">
                                {snippet.triggerPrefix && (
                                  <span className="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded">
                                    <Code2 className="size-2.5" />
                                    <span className="font-mono">{snippet.triggerPrefix}</span>
                                  </span>
                                )}
                                {snippet.isBuiltIn && (
                                  <span className="bg-primary/5 text-primary/70 px-1.5 py-0.5 rounded font-medium">
                                    built-in
                                  </span>
                                )}
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-md p-0 overflow-hidden bg-popover"
                        >
                          <div className="space-y-0">
                            <div className="px-3 py-2 border-b border-border bg-muted/50">
                              <p className="text-xs font-medium leading-relaxed text-popover-foreground">
                                {snippet.description}
                              </p>
                            </div>
                            <div className="px-3 py-2 bg-popover">
                              <pre className="text-[11px] font-mono leading-relaxed text-popover-foreground/90 whitespace-pre-wrap">
                                {cleanSnippetTemplate(snippet.template)}
                              </pre>
                            </div>
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
                        <DropdownMenuItem onClick={() => handleSnippetClick(snippet.template)}>
                          <Play className="text-muted-foreground" />
                          <span>Insert in editor</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopySnippet(snippet.template)}>
                          <Copy className="text-muted-foreground" />
                          <span>Copy snippet</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))
              )}
              {filteredSnippets.length > displayLimit && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsSnippetsDialogOpen(true)}
                  >
                    <MoreHorizontal />
                    <span>View all ({filteredSnippets.length})</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>

        <SnippetsDialog open={isSnippetsDialogOpen} onOpenChange={setIsSnippetsDialogOpen} />
        <CreateSnippetDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      </SidebarGroup>
    </Collapsible>
  )
}
