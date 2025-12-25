import { useState, useMemo, useEffect } from 'react'
import { Code2, Copy, Play, Trash2, Search, X, Filter, Pencil, Plus } from 'lucide-react'
import type { SnippetCategory } from '@shared/index'
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
import { useSnippetStore, useConnectionStore, useTabStore } from '@/stores'
import { cn } from '@/lib/utils'
import { getSnippetCategoryColor, cleanSnippetTemplate } from '@/lib/built-in-snippets'
import { CreateSnippetDialog } from './create-snippet-dialog'

interface SnippetsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FilterCategory = SnippetCategory | 'all'
type FilterType = 'all' | 'builtin' | 'custom'

export function SnippetsDialog({ open, onOpenChange }: SnippetsDialogProps) {
  const initializeSnippets = useSnippetStore((s) => s.initializeSnippets)
  const getAllSnippets = useSnippetStore((s) => s.getAllSnippets)
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const getActiveTab = useTabStore((s) => s.getActiveTab)
  const activeTabId = useTabStore((s) => s.activeTabId)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      initializeSnippets()
    }
  }, [open, initializeSnippets])

  const allSnippets = getAllSnippets()

  const filteredSnippets = useMemo(() => {
    let result = allSnippets

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.description.toLowerCase().includes(lowerQuery) ||
          s.template.toLowerCase().includes(lowerQuery) ||
          (s.triggerPrefix && s.triggerPrefix.toLowerCase().includes(lowerQuery))
      )
    }

    if (filterCategory !== 'all') {
      result = result.filter((s) => s.category === filterCategory)
    }

    if (filterType === 'builtin') {
      result = result.filter((s) => s.isBuiltIn)
    } else if (filterType === 'custom') {
      result = result.filter((s) => !s.isBuiltIn)
    }

    return result
  }, [allSnippets, searchQuery, filterCategory, filterType])

  const handleInsertSnippet = (template: string) => {
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
    onOpenChange(false)
  }

  const handleCopySnippet = (template: string) => {
    const cleanedTemplate = cleanSnippetTemplate(template)
    navigator.clipboard.writeText(cleanedTemplate)
  }

  const handleDeleteSnippet = async (id: string) => {
    if (confirm('Delete this snippet?')) {
      await deleteSnippet(id)
    }
  }

  const handleEditSnippet = (id: string) => {
    setEditingSnippetId(id)
    setIsCreateDialogOpen(true)
  }

  const editingSnippet = editingSnippetId
    ? allSnippets.find((s) => s.id === editingSnippetId)
    : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="size-4" />
              SQL Snippets
              <Badge variant="secondary" className="ml-2">
                {filteredSnippets.length} snippets
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 py-3 border-b space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search snippets..."
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

              <Select
                value={filterCategory}
                onValueChange={(v) => setFilterCategory(v as FilterCategory)}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="select">SELECT</SelectItem>
                  <SelectItem value="insert">INSERT</SelectItem>
                  <SelectItem value="update">UPDATE</SelectItem>
                  <SelectItem value="delete">DELETE</SelectItem>
                  <SelectItem value="ddl">DDL</SelectItem>
                  <SelectItem value="aggregate">Aggregate</SelectItem>
                  <SelectItem value="join">Join</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="builtin">Built-in</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs ml-auto"
                onClick={() => {
                  setEditingSnippetId(null)
                  setIsCreateDialogOpen(true)
                }}
              >
                <Plus className="size-3.5 mr-1.5" />
                New Snippet
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {filteredSnippets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {allSnippets.length === 0 ? (
                    <div className="space-y-2">
                      <Code2 className="size-8 mx-auto opacity-50" />
                      <p>No snippets available</p>
                      <p className="text-xs">Create your first snippet to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Search className="size-8 mx-auto opacity-50" />
                      <p>No snippets match your filters</p>
                    </div>
                  )}
                </div>
              ) : (
                filteredSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    className={cn(
                      'group rounded-lg border border-border/50 p-4 transition-all hover:bg-accent/30 hover:border-accent-foreground/20 hover:shadow-sm'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-2 py-0.5 font-semibold border-0',
                              getSnippetCategoryColor(snippet.category)
                            )}
                          >
                            {snippet.category.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-semibold">{snippet.name}</span>
                          {snippet.triggerPrefix && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-mono px-2 py-0.5 bg-muted/70"
                            >
                              <Code2 className="size-2.5 mr-1" />
                              {snippet.triggerPrefix}
                            </Badge>
                          )}
                          {snippet.isBuiltIn && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium border-primary/20 bg-primary/5 text-primary/80"
                            >
                              built-in
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {snippet.description}
                        </p>
                        <pre className="text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre-wrap break-all bg-muted/70 rounded-md px-3 py-2 max-h-[100px] overflow-auto border border-border/50">
                          {cleanSnippetTemplate(snippet.template)}
                        </pre>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0">
                        <TooltipProvider>
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 hover:bg-primary/10 hover:text-primary"
                                onClick={() => handleInsertSnippet(snippet.template)}
                              >
                                <Play className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Insert in editor
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 hover:bg-accent hover:text-foreground"
                                onClick={() => handleCopySnippet(snippet.template)}
                              >
                                <Copy className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Copy snippet
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {!snippet.isBuiltIn && (
                          <>
                            <TooltipProvider>
                              <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 hover:bg-blue-500/10 hover:text-blue-500"
                                    onClick={() => handleEditSnippet(snippet.id)}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Edit snippet
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                    onClick={() => handleDeleteSnippet(snippet.id)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Delete snippet
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <CreateSnippetDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) setEditingSnippetId(null)
        }}
        editingSnippet={editingSnippet}
      />
    </>
  )
}
