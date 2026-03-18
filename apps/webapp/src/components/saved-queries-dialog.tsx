import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Bookmark,
  Copy,
  Play,
  Trash2,
  Search,
  X,
  Pencil,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Hash,
  Clock,
  BarChart3,
  SortAsc
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useSavedQueryStore, useConnectionStore, useTabStore } from '@/stores'
import { cn } from '@/lib/utils'
import type { SavedQuery } from '@shared/index'

interface SavedQueriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditQuery?: (query: SavedQuery) => void
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString()
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
  if (normalized.startsWith('EXPLAIN')) return 'EXPLAIN'
  return 'SQL'
}

function getQueryTypeColor(type: string): string {
  switch (type) {
    case 'SELECT':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'INSERT':
      return 'bg-green-500/10 text-green-500 border-green-500/20'
    case 'UPDATE':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    case 'DELETE':
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'CREATE':
    case 'ALTER':
    case 'DROP':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    case 'EXPLAIN':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

type SortOption = 'name' | 'created' | 'lastUsed' | 'usageCount'

export function SavedQueriesDialog({ open, onOpenChange, onEditQuery }: SavedQueriesDialogProps) {
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const isInitialized = useSavedQueryStore((s) => s.isInitialized)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const deleteSavedQuery = useSavedQueryStore((s) => s.deleteSavedQuery)
  const incrementUsage = useSavedQueryStore((s) => s.incrementUsage)
  const getFolders = useSavedQueryStore((s) => s.getFolders)
  const getTags = useSavedQueryStore((s) => s.getTags)

  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>('all')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('lastUsed')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['(ungrouped)']))

  // Initialize on open
  useEffect(() => {
    if (open && !isInitialized) {
      initializeSavedQueries()
    }
  }, [open, isInitialized, initializeSavedQueries])

  // Get available folders and tags
  const folders = useMemo(() => getFolders(), [getFolders])
  const tags = useMemo(() => getTags(), [getTags])

  // Filter and sort queries
  const filteredQueries = useMemo(() => {
    let result = savedQueries

    // Search filter
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase()
      result = result.filter(
        (q) =>
          q.name.toLowerCase().includes(lowerSearch) ||
          q.query.toLowerCase().includes(lowerSearch) ||
          q.description?.toLowerCase().includes(lowerSearch)
      )
    }

    // Folder filter
    if (selectedFolder !== 'all') {
      if (selectedFolder === '(ungrouped)') {
        result = result.filter((q) => !q.folder)
      } else {
        result = result.filter((q) => q.folder === selectedFolder)
      }
    }

    // Tag filter
    if (selectedTag !== 'all') {
      result = result.filter((q) => q.tags.includes(selectedTag))
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return b.createdAt - a.createdAt
        case 'lastUsed':
          return (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
        case 'usageCount':
          return b.usageCount - a.usageCount
        default:
          return 0
      }
    })

    return result
  }, [savedQueries, searchQuery, selectedFolder, selectedTag, sortBy])

  // Group by folder
  const groupedQueries = useMemo(() => {
    const groups: { folder: string; queries: SavedQuery[] }[] = []
    const folderMap = new Map<string, SavedQuery[]>()

    filteredQueries.forEach((q) => {
      const folder = q.folder || '(ungrouped)'
      if (!folderMap.has(folder)) {
        folderMap.set(folder, [])
      }
      folderMap.get(folder)!.push(q)
    })

    // Sort folders: named folders first, then ungrouped
    const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '(ungrouped)') return 1
      if (b === '(ungrouped)') return -1
      return a.localeCompare(b)
    })

    sortedFolders.forEach((folder) => {
      groups.push({ folder, queries: folderMap.get(folder)! })
    })

    return groups
  }, [filteredQueries])

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }, [])

  const handleLoadQuery = useCallback(
    (query: SavedQuery) => {
      const targetConnectionId = query.connectionId || activeConnectionId
      if (!targetConnectionId) return

      const tabId = createQueryTab(targetConnectionId)
      updateTabQuery(tabId, query.query)
      incrementUsage(query.id)
      onOpenChange(false)
    },
    [activeConnectionId, createQueryTab, updateTabQuery, incrementUsage, onOpenChange]
  )

  const handleCopyQuery = useCallback((query: string) => {
    navigator.clipboard.writeText(query)
  }, [])

  const handleDeleteQuery = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this saved query?')) {
        await deleteSavedQuery(id)
      }
    },
    [deleteSavedQuery]
  )

  const getConnectionName = useCallback(
    (connectionId?: string) => {
      if (!connectionId) return null
      const conn = connections.find((c) => c.id === connectionId)
      return conn?.name || null
    },
    [connections]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="size-4" />
            Saved Queries
            <Badge variant="secondary" className="ml-2">
              {filteredQueries.length} {filteredQueries.length === 1 ? 'query' : 'queries'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="px-4 py-3 border-b space-y-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search saved queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                onClick={() => setSearchQuery('')}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <FolderOpen className="size-3 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                <SelectItem value="(ungrouped)">Ungrouped</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder} value={folder}>
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {tags.length > 0 && (
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <Hash className="size-3 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SortAsc className="size-3 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastUsed">Last used</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="usageCount">Most used</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Query List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {groupedQueries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {savedQueries.length === 0 ? (
                  <div className="space-y-2">
                    <Bookmark className="size-8 mx-auto opacity-50" />
                    <p>No saved queries yet</p>
                    <p className="text-xs">Save a query from the editor to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Search className="size-8 mx-auto opacity-50" />
                    <p>No queries match your filters</p>
                  </div>
                )}
              </div>
            ) : (
              groupedQueries.map((group) => (
                <Collapsible
                  key={group.folder}
                  open={expandedFolders.has(group.folder)}
                  onOpenChange={() => toggleFolder(group.folder)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                    {expandedFolders.has(group.folder) ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <FolderOpen className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {group.folder === '(ungrouped)' ? 'Ungrouped' : group.folder}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {group.queries.length}
                    </Badge>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="mt-2 space-y-2 pl-6">
                    {group.queries.map((query) => {
                      const queryType = getQueryType(query.query)
                      const connectionName = getConnectionName(query.connectionId)

                      return (
                        <div
                          key={query.id}
                          className="group rounded-lg border p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-medium text-sm truncate">{query.name}</span>
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px]', getQueryTypeColor(queryType))}
                                >
                                  {queryType}
                                </Badge>
                                {connectionName && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {connectionName}
                                  </Badge>
                                )}
                              </div>

                              {query.description && (
                                <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                                  {query.description}
                                </p>
                              )}

                              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all bg-muted/50 rounded px-2 py-1.5 max-h-[60px] overflow-auto">
                                {query.query}
                              </pre>

                              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {query.lastUsedAt
                                    ? formatRelativeTime(query.lastUsedAt)
                                    : 'Never used'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <BarChart3 className="size-3" />
                                  {query.usageCount} uses
                                </span>
                                {query.tags.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    {query.tags.slice(0, 3).map((tag) => (
                                      <Badge
                                        key={tag}
                                        variant="secondary"
                                        className="text-[9px] px-1 py-0"
                                      >
                                        {tag}
                                      </Badge>
                                    ))}
                                    {query.tags.length > 3 && (
                                      <span className="text-[9px]">+{query.tags.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      onClick={() => handleLoadQuery(query)}
                                    >
                                      <Play className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Open in new tab</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      onClick={() => handleCopyQuery(query.query)}
                                    >
                                      <Copy className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Copy query</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {onEditQuery && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        onClick={() => onEditQuery(query)}
                                      >
                                        <Pencil className="size-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit query</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                      onClick={() => handleDeleteQuery(query.id)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
