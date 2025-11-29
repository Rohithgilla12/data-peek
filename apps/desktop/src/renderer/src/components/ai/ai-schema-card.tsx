'use client'

import * as React from 'react'
import { Table2, Key, ChevronDown, ChevronUp, Hash, Type } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Column {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
}

interface AISchemaCardProps {
  table: {
    name: string
    columns: Column[]
  }
}

// Map common types to icons/colors
const getTypeStyle = (type: string) => {
  const lowerType = type.toLowerCase()

  if (lowerType.includes('int') || lowerType.includes('serial') || lowerType.includes('numeric')) {
    return { icon: Hash, color: 'text-amber-400' }
  }
  if (
    lowerType.includes('char') ||
    lowerType.includes('text') ||
    lowerType.includes('string') ||
    lowerType.includes('varchar')
  ) {
    return { icon: Type, color: 'text-emerald-400' }
  }
  if (lowerType.includes('bool')) {
    return { icon: null, color: 'text-purple-400' }
  }
  if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('stamp')) {
    return { icon: null, color: 'text-blue-400' }
  }
  if (lowerType.includes('uuid')) {
    return { icon: null, color: 'text-pink-400' }
  }
  if (lowerType.includes('json')) {
    return { icon: null, color: 'text-cyan-400' }
  }

  return { icon: null, color: 'text-zinc-400' }
}

export function AISchemaCard({ table }: AISchemaCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)

  const pkColumns = table.columns.filter((c) => c.isPrimaryKey)
  const displayColumns = isExpanded ? table.columns : table.columns.slice(0, 5)

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden',
        'bg-gradient-to-b from-zinc-900/60 to-zinc-900/40',
        'border border-zinc-800/60'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-zinc-800/30 bg-zinc-900/40 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Table2 className="size-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold text-zinc-200">{table.name}</span>
          <span className="text-[10px] text-zinc-500">
            {table.columns.length} column{table.columns.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pkColumns.length > 0 && (
            <div className="flex items-center gap-1">
              <Key className="size-3 text-amber-400" />
              <span className="text-[9px] text-amber-400/70">{pkColumns.length} PK</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="size-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Columns */}
      <div className="px-1 py-1">
        {displayColumns.map((column) => {
          const typeStyle = getTypeStyle(column.type)

          return (
            <div
              key={column.name}
              className={cn(
                'flex items-center justify-between px-2 py-1 rounded-md',
                'hover:bg-zinc-800/30 transition-colors'
              )}
            >
              <div className="flex items-center gap-2">
                {column.isPrimaryKey && <Key className="size-3 text-amber-400" />}
                <span
                  className={cn(
                    'text-[11px] font-mono',
                    column.isPrimaryKey ? 'text-zinc-200 font-medium' : 'text-zinc-400'
                  )}
                >
                  {column.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-mono', typeStyle.color)}>{column.type}</span>
                {column.nullable && <span className="text-[9px] text-zinc-600">NULL</span>}
              </div>
            </div>
          )
        })}

        {/* Show more indicator */}
        {!isExpanded && table.columns.length > 5 && (
          <div className="px-2 py-1 text-[10px] text-zinc-500 text-center">
            +{table.columns.length - 5} more columns
          </div>
        )}
      </div>
    </div>
  )
}
