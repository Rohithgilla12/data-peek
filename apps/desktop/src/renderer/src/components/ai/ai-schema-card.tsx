import * as React from 'react'
import {
  CaretDownIcon,
  CaretUpIcon,
  HashIcon,
  KeyIcon,
  TableIcon,
  TypeIcon
} from '@/components/icons'
import { cn } from '@data-peek/ui'

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
    return { icon: HashIcon, color: 'text-warning' }
  }
  if (
    lowerType.includes('char') ||
    lowerType.includes('text') ||
    lowerType.includes('string') ||
    lowerType.includes('varchar')
  ) {
    return { icon: TypeIcon, color: 'text-success' }
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

  return { icon: null, color: 'text-muted-foreground' }
}

export function AISchemaCard({ table }: AISchemaCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)

  const pkColumns = table.columns.filter((c) => c.isPrimaryKey)
  const displayColumns = isExpanded ? table.columns : table.columns.slice(0, 5)

  return (
    <div className={cn('rounded-xl overflow-hidden', 'bg-card', 'border border-border')}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <TableIcon className="size-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold text-foreground">{table.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {table.columns.length} column{table.columns.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pkColumns.length > 0 && (
            <div className="flex items-center gap-1">
              <KeyIcon className="size-3 text-warning" />
              <span className="text-[9px] text-warning/70">{pkColumns.length} PK</span>
            </div>
          )}
          {isExpanded ? (
            <CaretUpIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-3.5 text-muted-foreground" />
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
                'hover:bg-muted transition-colors'
              )}
            >
              <div className="flex items-center gap-2">
                {column.isPrimaryKey && <KeyIcon className="size-3 text-warning" />}
                <span
                  className={cn(
                    'text-[11px] font-mono',
                    column.isPrimaryKey ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  {column.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-mono', typeStyle.color)}>{column.type}</span>
                {column.nullable && <span className="text-[9px] text-muted-foreground">NULL</span>}
              </div>
            </div>
          )
        })}

        {/* Show more indicator */}
        {!isExpanded && table.columns.length > 5 && (
          <div className="px-2 py-1 text-[10px] text-muted-foreground text-center">
            +{table.columns.length - 5} more columns
          </div>
        )}
      </div>
    </div>
  )
}
