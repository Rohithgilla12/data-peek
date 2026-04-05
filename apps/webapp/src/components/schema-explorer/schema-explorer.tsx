'use client'

import { useEffect, useMemo } from 'react'
import { useQueryState, parseAsString } from 'nuqs'
import { ChevronRight, Database, Loader2, Search } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useSchemaStore } from '@/stores/schema-store'
import { SchemaTableItem } from './schema-table-item'

export function SchemaExplorer() {
  const { activeConnectionId } = useConnectionStore()
  const { schemas, setSchemas, expandedSchemas, toggleSchema } = useSchemaStore()
  const [search, setSearch] = useQueryState('schemaSearch', parseAsString.withDefault(''))

  const { data, isLoading, error } = trpc.schema.getSchemas.useQuery(
    { connectionId: activeConnectionId! },
    { enabled: !!activeConnectionId },
  )

  useEffect(() => {
    if (data) setSchemas(data)
  }, [data, setSchemas])

  const filteredSchemas = useMemo(() => {
    if (!search.trim()) return schemas
    const term = search.toLowerCase()
    return schemas
      .map((schema) => ({
        ...schema,
        tables: schema.tables.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.columns.some((c) => c.name.toLowerCase().includes(term))
        ),
      }))
      .filter((schema) => schema.tables.length > 0 || schema.name.toLowerCase().includes(term))
  }, [schemas, search])

  if (!activeConnectionId) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        Select a connection to browse schemas
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading schema...
      </div>
    )
  }

  if (error) {
    return <div className="px-3 py-4 text-xs text-destructive">{error.message}</div>
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="px-2 py-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables, columns, routines..."
            className="w-full rounded-md border border-border/50 bg-input/50 pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredSchemas.map((schema) => {
          const isExpanded = expandedSchemas.has(schema.name) || search.trim().length > 0
          return (
            <div key={schema.name}>
              <button
                onClick={() => toggleSchema(schema.name)}
                className="flex w-full items-center gap-1.5 px-3 py-1 text-xs hover:bg-muted/50 transition-colors"
              >
                <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                <Database className="h-3 w-3 text-accent" />
                <span className="font-medium text-foreground">{schema.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {schema.tables.length}
                </span>
              </button>
              {isExpanded && (
                <div className="animate-expand">
                  {schema.tables.map((table) => (
                    <SchemaTableItem key={table.name} table={table} schemaName={schema.name} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filteredSchemas.length === 0 && search && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No tables or columns match "{search}"
          </div>
        )}
      </div>
    </div>
  )
}
