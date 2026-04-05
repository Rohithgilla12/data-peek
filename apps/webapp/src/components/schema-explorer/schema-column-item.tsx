'use client'

import { Key, Link2 } from 'lucide-react'
import type { ColumnInfo } from '@shared/index'

const typeColors: Record<string, string> = {
  int4: 'text-blue-400',
  int8: 'text-blue-400',
  integer: 'text-blue-400',
  bigint: 'text-blue-400',
  smallint: 'text-blue-400',
  serial: 'text-blue-400',
  bigserial: 'text-blue-400',
  text: 'text-green-400',
  varchar: 'text-green-400',
  char: 'text-green-400',
  name: 'text-green-400',
  bool: 'text-yellow-400',
  boolean: 'text-yellow-400',
  timestamp: 'text-purple-400',
  timestamptz: 'text-purple-400',
  date: 'text-purple-400',
  time: 'text-purple-400',
  json: 'text-orange-400',
  jsonb: 'text-orange-400',
  uuid: 'text-pink-400',
  numeric: 'text-blue-300',
  decimal: 'text-blue-300',
  float: 'text-blue-300',
  double: 'text-blue-300',
}

export function SchemaColumnItem({ column }: { column: ColumnInfo }) {
  const typeColor = typeColors[column.dataType] ?? 'text-muted-foreground'

  const fkRef = column.foreignKey
    ? `${column.foreignKey.referencedSchema}.${column.foreignKey.referencedTable}.${column.foreignKey.referencedColumn}`
    : null

  return (
    <div
      className="flex items-center gap-2 py-0.5 pl-10 pr-3 text-xs hover:bg-muted/50 group"
      title={
        [
          fkRef ? `FK → ${fkRef}` : null,
          column.defaultValue ? `Default: ${column.defaultValue}` : null,
        ]
          .filter(Boolean)
          .join('\n') || undefined
      }
    >
      {column.isPrimaryKey ? (
        <Key className="h-3 w-3 text-yellow-500 flex-shrink-0" />
      ) : column.foreignKey ? (
        <Link2 className="h-3 w-3 text-accent flex-shrink-0" />
      ) : null}
      <span className="text-foreground truncate">{column.name}</span>
      {column.defaultValue && (
        <span className="text-[9px] text-muted-foreground/50 flex-shrink-0 truncate max-w-[80px]">
          ={column.defaultValue}
        </span>
      )}
      <span className={`ml-auto flex-shrink-0 font-mono text-[10px] ${typeColor}`}>
        {column.dataType}
      </span>
      {column.foreignKey && (
        <span className="flex items-center gap-0.5 text-[10px] text-accent flex-shrink-0">
          {column.foreignKey.referencedTable}
        </span>
      )}
      {!column.isNullable && !column.isPrimaryKey && (
        <span className="text-[9px] text-red-400/60 flex-shrink-0">NOT NULL</span>
      )}
    </div>
  )
}
