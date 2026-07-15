import * as React from 'react'
import { Play, ChevronDown } from 'lucide-react'
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel
} from '@data-peek/ui'

import { SQLEditor } from '@/components/sql-editor'
import { useConnectionStore, useTabStore, useSettingsStore } from '@/stores'

export function SidebarQuickQuery() {
  const hideQuickQueryPanel = useSettingsStore((s) => s.hideQuickQueryPanel)

  const [isOpen, setIsOpen] = React.useState(true)
  const [quickQuery, setQuickQuery] = React.useState('')

  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const schemas = useConnectionStore((s) => s.schemas)

  const createQueryTab = useTabStore((s) => s.createQueryTab)

  const handleRunQuickQuery = () => {
    if (!activeConnection || !quickQuery.trim()) return
    createQueryTab(activeConnection.id, quickQuery)
    setQuickQuery('')
  }

  if (hideQuickQueryPanel) {
    return null
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

              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!activeConnection || !quickQuery.trim()}
                onClick={handleRunQuickQuery}
              >
                <Play className="size-3" />
                Run in New Tab
              </Button>
            </div>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
