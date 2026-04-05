'use client'

import { Table, Eye, Layers, ChevronRight, Play } from 'lucide-react'
import type { TableInfo } from '@shared/index'
import { useSchemaStore } from '@/stores/schema-store'
import { useQueryStore } from '@/stores/query-store'
import { SchemaColumnItem } from './schema-column-item'

const tableIcons: Record<string, typeof Table> = {
  table: Table,
  view: Eye,
  materialized_view: Layers,
}

export function SchemaTableItem({ table, schemaName }: { table: TableInfo; schemaName: string }) {
  const key = `${schemaName}.${table.name}`
  const { expandedTables, toggleTable } = useSchemaStore()
  const { activeTabId, updateSql } = useQueryStore()
  const isExpanded = expandedTables.has(key)
  const Icon = tableIcons[table.type] ?? Table

  function handleViewData(e: React.MouseEvent) {
    e.stopPropagation()
    const sql = `SELECT * FROM "${schemaName}"."${table.name}" LIMIT 100`
    updateSql(activeTabId, sql)
    window.dispatchEvent(new CustomEvent('datapeek:execute'))
  }

  return (
    <div>
      <div className="group flex w-full items-center gap-1.5 py-1 pl-6 pr-3 text-xs hover:bg-muted/50 transition-colors">
        <button
          onClick={() => toggleTable(key)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
          <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-foreground truncate">{table.name}</span>
        </button>
        <button
          onClick={handleViewData}
          className="hidden group-hover:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/10 transition-all duration-150"
          title={`SELECT * FROM ${schemaName}.${table.name}`}
        >
          <Play className="h-2.5 w-2.5" />
        </button>
        <span className="text-[10px] text-muted-foreground group-hover:hidden">{table.columns.length}</span>
      </div>
      {isExpanded && (
        <div className="animate-expand">
          {table.columns.map((col) => <SchemaColumnItem key={col.name} column={col} />)}
        </div>
      )}
    </div>
  )
}
