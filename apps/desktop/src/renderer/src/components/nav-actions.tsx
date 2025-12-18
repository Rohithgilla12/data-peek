import * as React from 'react'
import {
  Play,
  Wand2,
  Copy,
  Trash2,
  FileJson,
  FileSpreadsheet,
  MoreHorizontal,
  Loader2,
  BookmarkPlus,
  Sparkles
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatSQL } from '@/lib/sql-formatter'
import { keys } from '@/lib/utils'
import { useQueryStore, useConnectionStore } from '@/stores'

export function NavActions() {
  const [isOpen, setIsOpen] = React.useState(false)
  const { copied, copy } = useCopyToClipboard()

  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const { currentQuery, isExecuting, result } = useQueryStore()
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const setIsExecuting = useQueryStore((s) => s.setIsExecuting)
  const addToHistory = useQueryStore((s) => s.addToHistory)

  const handleRunQuery = () => {
    if (!activeConnection || isExecuting || !currentQuery.trim()) return

    setIsExecuting(true)
    const startTime = Date.now()

    setTimeout(
      () => {
        const durationMs = Date.now() - startTime + Math.random() * 50
        addToHistory({
          query: currentQuery,
          durationMs: Math.round(durationMs),
          rowCount: result?.rowCount ?? 0,
          status: 'success',
          connectionId: activeConnection.id
        })
        setIsExecuting(false)
      },
      300 + Math.random() * 200
    )
  }

  const handleFormatQuery = () => {
    if (!currentQuery.trim()) return
    const formatted = formatSQL(currentQuery)
    setCurrentQuery(formatted)
    setIsOpen(false)
  }

  const handleCopyQuery = async () => {
    if (!currentQuery.trim()) return
    await copy(currentQuery)
    setIsOpen(false)
  }

  const handleClearEditor = () => {
    setCurrentQuery('')
    setIsOpen(false)
  }

  const handleExportCSV = () => {
    if (!result) return
    // Generate CSV
    const headers = result.columns.map((c) => c.name).join(',')
    const rows = result.rows.map((row) =>
      result.columns
        .map((c) => {
          const val = row[c.name]
          if (val === null || val === undefined) return ''
          const str = String(val)
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
        })
        .join(',')
    )
    const csv = [headers, ...rows].join('\n')

    // Download
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setIsOpen(false)
  }

  const handleExportJSON = () => {
    if (!result) return
    const json = JSON.stringify(result.rows, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setIsOpen(false)
  }

  const canRun = activeConnection && currentQuery.trim() && !isExecuting
  const hasResults = !!result

  return (
    <div className="flex items-center gap-1.5">
      {/* Run Query Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="gap-1.5 h-7 px-2.5"
            disabled={!canRun}
            onClick={handleRunQuery}
          >
            {isExecuting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            <span className="hidden sm:inline">Run</span>
            <kbd className="ml-0.5 hidden rounded bg-primary-foreground/20 px-1 py-0.5 text-[9px] font-medium sm:inline">
              {keys.mod}
              {keys.enter}
            </kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Execute query ({keys.mod}+Enter)</p>
        </TooltipContent>
      </Tooltip>

      {/* Format Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!currentQuery.trim()}
            onClick={handleFormatQuery}
          >
            <Wand2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>
            Format SQL ({keys.mod}+{keys.shift}+F)
          </p>
        </TooltipContent>
      </Tooltip>

      {/* More Actions Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="data-[state=open]:bg-accent h-7 w-7">
            <MoreHorizontal className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 overflow-hidden rounded-lg p-0" align="end">
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              {/* Query Actions */}
              <SidebarGroup className="border-b py-1.5">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleCopyQuery}
                        disabled={!currentQuery.trim()}
                        className="gap-2.5"
                      >
                        <Copy className="size-4" />
                        <span>{copied ? 'Copied!' : 'Copy Query'}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleClearEditor}
                        disabled={!currentQuery.trim()}
                        className="gap-2.5"
                      >
                        <Trash2 className="size-4" />
                        <span>Clear Editor</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled className="gap-2.5">
                        <BookmarkPlus className="size-4" />
                        <span>Save to Snippets</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* AI Actions */}
              <SidebarGroup className="border-b py-1.5">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled className="gap-2.5">
                        <Sparkles className="size-4" />
                        <span>Explain Query</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Export Actions */}
              <SidebarGroup className="py-1.5">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleExportCSV}
                        disabled={!hasResults}
                        className="gap-2.5"
                      >
                        <FileSpreadsheet className="size-4" />
                        <span>Export as CSV</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleExportJSON}
                        disabled={!hasResults}
                        className="gap-2.5"
                      >
                        <FileJson className="size-4" />
                        <span>Export as JSON</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>
    </div>
  )
}
