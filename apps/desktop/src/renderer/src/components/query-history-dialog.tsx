import { useState, useMemo } from 'react'
import {
  Clock,
  Copy,
  Play,
  Trash2,
  Search,
  X,
  CheckCircle2,
  XCircle,
  Calendar,
  Filter
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
import { useQueryStore, useConnectionStore, useTabStore } from '@/stores'
import { cn } from '@/lib/utils'

interface QueryHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

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

type FilterStatus = 'all' | 'success' | 'error'
type FilterType = 'all' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL'

export function QueryHistoryDialog({ open, onOpenChange }: QueryHistoryDialogProps) {
  const history = useQueryStore((s) => s.history)
  const removeFromHistory = useQueryStore((s) => s.removeFromHistory)
  const clearHistory = useQueryStore((s) => s.clearHistory)
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedConnection, setSelectedConnection] = useState<string>('all')

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // Search filter
      if (searchQuery && !item.query.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) {
        return false
      }

      // Type filter
      if (filterType !== 'all') {
        const queryType = getQueryType(item.query)
        if (filterType === 'DDL') {
          if (!['CREATE', 'ALTER', 'DROP'].includes(queryType)) return false
        } else if (queryType !== filterType) {
          return false
        }
      }

      // Connection filter
      if (selectedConnection !== 'all' && item.connectionId !== selectedConnection) {
        return false
      }

      return true
    })
  }, [history, searchQuery, filterStatus, filterType, selectedConnection])

  // Group by date
  const groupedHistory = useMemo(() => {
    const groups: { label: string; items: typeof history }[] = []
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayItems = filteredHistory.filter((item) => {
      const itemDate = new Date(item.timestamp)
      return itemDate.toDateString() === today.toDateString()
    })

    const yesterdayItems = filteredHistory.filter((item) => {
      const itemDate = new Date(item.timestamp)
      return itemDate.toDateString() === yesterday.toDateString()
    })

    const olderItems = filteredHistory.filter((item) => {
      const itemDate = new Date(item.timestamp)
      return (
        itemDate.toDateString() !== today.toDateString() &&
        itemDate.toDateString() !== yesterday.toDateString()
      )
    })

    if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems })
    if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems })
    if (olderItems.length > 0) groups.push({ label: 'Older', items: olderItems })

    return groups
  }, [filteredHistory])

  const handleRunQuery = (query: string, connectionId: string) => {
    // Find or use active connection
    const targetConnectionId = connectionId || activeConnectionId
    if (!targetConnectionId) return

    const tabId = createQueryTab(targetConnectionId)
    updateTabQuery(tabId, query)
    onOpenChange(false)
  }

  const handleCopyQuery = (query: string) => {
    navigator.clipboard.writeText(query)
  }

  const getConnectionName = (connectionId: string) => {
    const conn = connections.find((c) => c.id === connectionId)
    return conn?.name || 'Unknown'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            Query History
            <Badge variant="secondary" className="ml-2">
              {filteredHistory.length} queries
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="px-4 py-3 border-b space-y-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search queries..."
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
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Filters:</span>
            </div>

            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="SELECT">SELECT</SelectItem>
                <SelectItem value="INSERT">INSERT</SelectItem>
                <SelectItem value="UPDATE">UPDATE</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="DDL">DDL</SelectItem>
              </SelectContent>
            </Select>

            {connections.length > 1 && (
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All connections</SelectItem>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 ml-auto"
                onClick={() => {
                  if (confirm('Clear all query history?')) {
                    clearHistory()
                  }
                }}
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* History List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {groupedHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {history.length === 0 ? (
                  <div className="space-y-2">
                    <Clock className="size-8 mx-auto opacity-50" />
                    <p>No query history yet</p>
                    <p className="text-xs">Run some queries to see them here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Search className="size-8 mx-auto opacity-50" />
                    <p>No queries match your filters</p>
                  </div>
                )}
              </div>
            ) : (
              groupedHistory.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">{group.label}</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const queryType = getQueryType(item.query)
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'group rounded-lg border p-3 transition-colors hover:bg-muted/50',
                            item.status === 'error' && 'border-red-500/30 bg-red-500/5'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px]', getQueryTypeColor(queryType))}
                                >
                                  {queryType}
                                </Badge>
                                {item.status === 'success' ? (
                                  <CheckCircle2 className="size-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="size-3.5 text-red-500" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(item.timestamp)}
                                </span>
                                {item.status === 'success' && (
                                  <>
                                    <span className="text-xs text-muted-foreground">
                                      {item.rowCount.toLocaleString()} rows
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.durationMs}ms
                                    </span>
                                  </>
                                )}
                                {connections.length > 1 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {getConnectionName(item.connectionId)}
                                  </Badge>
                                )}
                              </div>
                              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all bg-muted/50 rounded px-2 py-1.5 max-h-[100px] overflow-auto">
                                {item.query}
                              </pre>
                              {item.status === 'error' && item.errorMessage && (
                                <p className="text-xs text-red-500 mt-1.5">{item.errorMessage}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      onClick={() => handleRunQuery(item.query, item.connectionId)}
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
                                      onClick={() => handleCopyQuery(item.query)}
                                    >
                                      <Copy className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Copy query</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                      onClick={() => removeFromHistory(item.id)}
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
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
