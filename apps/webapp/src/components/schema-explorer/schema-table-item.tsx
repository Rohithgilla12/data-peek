'use client'

import { Table, Eye, Layers, ChevronRight } from 'lucide-react'
import type { TableInfo } from '@shared/index'
import { useSchemaStore } from '@/stores/schema-store'
import { SchemaColumnItem } from './schema-column-item'

const tableIcons: Record<string, typeof Table> = {
  table: Table,
  view: Eye,
  materialized_view: Layers,
}

export function SchemaTableItem({ table, schemaName }: { table: TableInfo; schemaName: string }) {
  const key = `${schemaName}.${table.name}`
  const { expandedTables, toggleTable } = useSchemaStore()
  const isExpanded = expandedTables.has(key)
  const Icon = tableIcons[table.type] ?? Table

  return (
    <div>
      <button
        onClick={() => toggleTable(key)}
        className="flex w-full items-center gap-1.5 py-1 pl-6 pr-3 text-xs hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-foreground truncate">{table.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{table.columns.length}</span>
      </button>
      {isExpanded && (
        <div className="animate-expand">
          {table.columns.map((col) => <SchemaColumnItem key={col.name} column={col} />)}
        </div>
      )}
    </div>
  )
}
