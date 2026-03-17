import * as React from 'react'
import { Play, Send, ChevronDown, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { SQLEditor } from '@/components/sql-editor'
import { useQueryStore, useConnectionStore, useTabStore, useSettingsStore } from '@/stores'
import { cn } from '@/lib/utils'

export function SidebarQuickQuery() {
  const hideQuickQueryPanel = useSettingsStore((s) => s.hideQuickQueryPanel)

  const [isOpen, setIsOpen] = React.useState(true)
  const [quickQuery, setQuickQuery] = React.useState('')

  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const schemas = useConnectionStore((s) => s.schemas)
  const { history } = useQueryStore()

  const createQueryTab = useTabStore((s) => s.createQueryTab)

  // Get recent 3 queries for quick access
  const recentQueries = React.useMemo(() => {
    return history
      .filter((h) => h.status === 'success')
      .slice(0, 3)
      .map((h) => ({
        id: h.id,
        query: h.query,
        preview: h.query.replace(/\s+/g, ' ').slice(0, 40) + (h.query.length > 40 ? '...' : '')
      }))
  }, [history])

  const handleRunQuickQuery = () => {
    if (!activeConnection || !quickQuery.trim()) return
    // Create a new query tab with the query
    createQueryTab(activeConnection.id, quickQuery)
    setQuickQuery('')
  }

  const handleSendToMainEditor = () => {
    if (!quickQuery.trim() || !activeConnection) return
    // Create a new query tab with the query
    createQueryTab(activeConnection.id, quickQuery)
    setQuickQuery('')
  }

  const handleUseRecentQuery = (query: string) => {
    if (!activeConnection) return
    // Create a new query tab with the recent query
    createQueryTab(activeConnection.id, query)
  }

  if (hideQuickQueryPanel) {
    return <></>
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup className="p-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-sidebar-accent/50">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quick Query
            </span>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent className="px-3 pb-3">
            {/* Compact SQL Editor */}
            <div className="space-y-2">
              <SQLEditor
                value={quickQuery}
                onChange={setQuickQuery}
                onRun={handleRunQuickQuery}
                height={80}
                compact
                placeholder="Quick SQL..."
                readOnly={!activeConnection}
                schemas={schemas}
              />

              {/* Action Buttons */}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 h-7 gap-1.5 text-xs"
                  disabled={!activeConnection || !quickQuery.trim()}
                  onClick={handleRunQuickQuery}
                >
                  <Play className="size-3" />
                  New Tab
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 gap-1.5 text-xs"
                  disabled={!quickQuery.trim()}
                  onClick={handleSendToMainEditor}
                >
                  <Send className="size-3" />
                  Send to Editor
                </Button>
              </div>
            </div>

            {/* Recent Queries */}
            {recentQueries.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recent
                  </span>
                </div>
                <SidebarMenu>
                  {recentQueries.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => handleUseRecentQuery(item.query)}
                        className="h-auto py-1.5 px-2"
                      >
                        <code className="text-[10px] font-mono text-muted-foreground truncate">
                          {item.preview}
                        </code>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            )}

            {/* No Connection State */}
            {!activeConnection && (
              <div className="mt-2 text-center">
                <p className="text-[10px] text-muted-foreground">
                  Select a connection to run queries
                </p>
              </div>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
