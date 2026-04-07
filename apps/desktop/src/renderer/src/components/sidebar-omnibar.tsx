import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import {
  Search,
  Table2,
  Columns3,
  Key,
  Bookmark,
  Clock,
  Code2,
  FunctionSquare,
  Workflow,
  CornerDownLeft
} from 'lucide-react'

import { cn } from '@data-peek/ui'
import {
  useConnectionStore,
  useTabStore,
  useQueryStore,
  useSavedQueryStore,
  useSnippetStore
} from '@/stores'
import { cleanSnippetTemplate } from '@/lib/built-in-snippets'
import type { TableInfo } from '@shared/index'

interface OmnibarItem {
  id: string
  label: string
  sublabel?: string
  group: 'tables' | 'columns' | 'routines' | 'saved' | 'snippets' | 'history'
  icon: React.ReactNode
  keywords: string[]
  onSelect: () => void
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const idx = lower.indexOf(qLower)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

const GROUP_LABELS: Record<string, string> = {
  tables: 'Tables & Views',
  columns: 'Columns',
  routines: 'Functions & Procedures',
  saved: 'Saved Queries',
  snippets: 'Snippets',
  history: 'Recent Queries'
}

const GROUP_ORDER = ['tables', 'columns', 'routines', 'saved', 'snippets', 'history']

export function SidebarOmnibar() {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [query, setQuery] = React.useState('')
  const [isFocused, setIsFocused] = React.useState(false)
  const isActive = query.length > 0 || isFocused

  const schemas = useConnectionStore((s) => s.schemas)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)
  const createTablePreviewTab = useTabStore((s) => s.createTablePreviewTab)
  const findTablePreviewTab = useTabStore((s) => s.findTablePreviewTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const getActiveTab = useTabStore((s) => s.getActiveTab)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const history = useQueryStore((s) => s.history)
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const getAllSnippets = useSnippetStore((s) => s.getAllSnippets)

  const handleTableClick = React.useCallback(
    (schemaName: string, table: TableInfo) => {
      const connection = getActiveConnection()
      if (!connection) return
      const existingTab = findTablePreviewTab(connection.id, schemaName, table.name)
      if (existingTab) {
        setActiveTab(existingTab.id)
      } else {
        createTablePreviewTab(connection.id, schemaName, table.name)
      }
      setQuery('')
      inputRef.current?.blur()
    },
    [getActiveConnection, findTablePreviewTab, setActiveTab, createTablePreviewTab]
  )

  const handleQuerySelect = React.useCallback(
    (sql: string) => {
      const connection = getActiveConnection()
      if (!connection) return
      createQueryTab(connection.id, sql)
      setQuery('')
      inputRef.current?.blur()
    },
    [getActiveConnection, createQueryTab]
  )

  const handleSnippetSelect = React.useCallback(
    (template: string) => {
      const cleaned = cleanSnippetTemplate(template)
      const activeTab = getActiveTab()
      if (
        activeTabId &&
        activeTab &&
        (activeTab.type === 'query' || activeTab.type === 'table-preview')
      ) {
        const current = activeTab.query || ''
        updateTabQuery(activeTabId, current ? `${current}\n${cleaned}` : cleaned)
      } else {
        const connection = getActiveConnection()
        if (connection) createQueryTab(connection.id, cleaned)
      }
      setQuery('')
      inputRef.current?.blur()
    },
    [getActiveTab, activeTabId, updateTabQuery, getActiveConnection, createQueryTab]
  )

  const items = React.useMemo<OmnibarItem[]>(() => {
    if (!activeConnectionId) return []

    const result: OmnibarItem[] = []

    for (const schema of schemas) {
      for (const table of schema.tables) {
        result.push({
          id: `table:${schema.name}.${table.name}`,
          label: table.name,
          sublabel: schema.name,
          group: 'tables',
          icon: (
            <Table2
              className={cn(
                'size-3.5',
                table.type === 'view'
                  ? 'text-purple-500'
                  : table.type === 'materialized_view'
                    ? 'text-teal-500'
                    : 'text-muted-foreground'
              )}
            />
          ),
          keywords: [schema.name, table.type, ...table.columns.map((c) => c.name)],
          onSelect: () => handleTableClick(schema.name, table)
        })

        for (const col of table.columns) {
          result.push({
            id: `col:${schema.name}.${table.name}.${col.name}`,
            label: col.name,
            sublabel: `${table.name}.${col.dataType}`,
            group: 'columns',
            icon: col.isPrimaryKey ? (
              <Key className="size-3.5 text-yellow-500" />
            ) : (
              <Columns3 className="size-3.5 text-muted-foreground" />
            ),
            keywords: [table.name, schema.name, col.dataType],
            onSelect: () => handleTableClick(schema.name, table)
          })
        }
      }

      for (const routine of schema.routines ?? []) {
        result.push({
          id: `routine:${schema.name}.${routine.name}`,
          label: routine.name,
          sublabel: `${schema.name} ${routine.type}`,
          group: 'routines',
          icon:
            routine.type === 'function' ? (
              <FunctionSquare className="size-3.5 text-cyan-500" />
            ) : (
              <Workflow className="size-3.5 text-orange-500" />
            ),
          keywords: [schema.name, routine.type, ...(routine.parameters?.map((p) => p.name) ?? [])],
          onSelect: () => {
            const connection = getActiveConnection()
            if (!connection) return
            const qualifiedName = `"${schema.name}"."${routine.name}"`
            const paramPlaceholders = routine.parameters
              .filter((p) => p.mode === 'IN' || p.mode === 'INOUT')
              .map((p) => `/* ${p.name}: ${p.dataType} */`)
              .join(', ')
            const sql =
              routine.type === 'procedure'
                ? `CALL ${qualifiedName}(${paramPlaceholders});`
                : `SELECT * FROM ${qualifiedName}(${paramPlaceholders});`
            createQueryTab(connection.id, sql)
            setQuery('')
            inputRef.current?.blur()
          }
        })
      }
    }

    for (const sq of savedQueries) {
      result.push({
        id: `saved:${sq.id}`,
        label: sq.name,
        sublabel: sq.description || sq.query.replace(/\s+/g, ' ').slice(0, 50),
        group: 'saved',
        icon: <Bookmark className="size-3.5 text-amber-500" />,
        keywords: [sq.query, sq.description ?? ''],
        onSelect: () => handleQuerySelect(sq.query)
      })
    }

    const allSnippets = getAllSnippets()
    for (const snippet of allSnippets) {
      result.push({
        id: `snippet:${snippet.id}`,
        label: snippet.name,
        sublabel: snippet.description,
        group: 'snippets',
        icon: <Code2 className="size-3.5 text-emerald-500" />,
        keywords: [snippet.category, snippet.description, snippet.template],
        onSelect: () => handleSnippetSelect(snippet.template)
      })
    }

    const recentHistory = history
      .filter((h) => h.status === 'success' && h.connectionId === activeConnectionId)
      .slice(0, 20)
    for (const h of recentHistory) {
      result.push({
        id: `history:${h.id}`,
        label: h.query.replace(/\s+/g, ' ').slice(0, 60),
        sublabel: `${h.rowCount} rows`,
        group: 'history',
        icon: <Clock className="size-3.5 text-muted-foreground" />,
        keywords: [h.query],
        onSelect: () => handleQuerySelect(h.query)
      })
    }

    return result
  }, [
    schemas,
    activeConnectionId,
    savedQueries,
    getAllSnippets,
    history,
    handleTableClick,
    handleQuerySelect,
    handleSnippetSelect,
    getActiveConnection,
    createQueryTab
  ])

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, OmnibarItem[]> = {}
    for (const item of items) {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
    }
    return groups
  }, [items])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
          return
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!activeConnectionId) return null

  return (
    <div className="px-2 pt-2">
      <CommandPrimitive
        className={cn(
          'rounded-md border border-border/50 bg-sidebar-accent/30 transition-all duration-300',
          isActive && 'bg-sidebar-accent/60 border-border shadow-sm'
        )}
        filter={(value, search, keywords) => {
          if (!search) return 1
          const searchLower = search.toLowerCase()
          const valueLower = value.toLowerCase()
          const keywordsStr = keywords?.join(' ').toLowerCase() ?? ''
          if (valueLower === searchLower) return 1
          if (valueLower.startsWith(searchLower)) return 0.95
          if (valueLower.includes(searchLower)) return 0.8
          if (keywordsStr.includes(searchLower)) return 0.6
          return 0
        }}
      >
        <div className="flex items-center px-2 gap-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            placeholder="Search everything..."
            className="flex h-7 w-full bg-transparent py-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {!isActive && (
            <kbd className="pointer-events-none shrink-0 rounded border border-border/50 bg-sidebar-accent/50 px-1 py-0.5 text-[10px] font-mono text-muted-foreground/50">
              /
            </kbd>
          )}
        </div>

        <div
          className="overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
          style={{
            display: 'grid',
            gridTemplateRows: isActive && query.length > 0 ? '1fr' : '0fr'
          }}
        >
          <div className="min-h-0">
            <CommandPrimitive.List className="max-h-[min(60vh,400px)] overflow-y-auto border-t border-border/30 py-1">
              <CommandPrimitive.Empty className="py-4 text-center text-xs text-muted-foreground">
                No results found
              </CommandPrimitive.Empty>

              {GROUP_ORDER.map((groupKey) => {
                const groupItems = groupedItems[groupKey]
                if (!groupItems?.length) return null

                return (
                  <CommandPrimitive.Group
                    key={groupKey}
                    heading={GROUP_LABELS[groupKey]}
                    className="px-1 py-0.5 [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/60"
                  >
                    {groupItems.map((item) => (
                      <CommandPrimitive.Item
                        key={item.id}
                        value={item.label}
                        keywords={item.keywords}
                        onSelect={item.onSelect}
                        className="flex items-center gap-2 rounded px-1.5 py-1 text-xs cursor-pointer select-none data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground text-muted-foreground transition-colors duration-150"
                      >
                        {item.icon}
                        <span className="flex-1 truncate">
                          <HighlightMatch text={item.label} query={query} />
                        </span>
                        {item.sublabel && (
                          <span className="shrink-0 text-[10px] text-muted-foreground/50 max-w-[120px] truncate">
                            {item.sublabel}
                          </span>
                        )}
                        <CornerDownLeft className="size-3 shrink-0 opacity-0 [[data-selected=true]_&]:opacity-40 transition-opacity" />
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )
              })}
            </CommandPrimitive.List>
          </div>
        </div>
      </CommandPrimitive>
    </div>
  )
}
