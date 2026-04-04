'use client'

import { useEffect } from 'react'
import { ChevronRight, Database, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useSchemaStore } from '@/stores/schema-store'
import { SchemaTableItem } from './schema-table-item'

export function SchemaExplorer() {
  const { activeConnectionId } = useConnectionStore()
  const { schemas, setSchemas, expandedSchemas, toggleSchema } = useSchemaStore()

  const { data, isLoading, error } = trpc.schema.getSchemas.useQuery(
    { connectionId: activeConnectionId! },
    { enabled: !!activeConnectionId },
  )

  useEffect(() => {
    if (data) setSchemas(data)
  }, [data, setSchemas])

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
    <div className="flex-1 overflow-y-auto py-1">
      {schemas.map((schema) => {
        const isExpanded = expandedSchemas.has(schema.name)
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
    </div>
  )
}
