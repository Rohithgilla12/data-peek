'use client'

import * as React from 'react'
import { ExternalLink } from 'lucide-react'
import type { ForeignKeyInfo } from '@data-peek/shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface FKCellValueProps {
  value: unknown
  foreignKey: ForeignKeyInfo
  onForeignKeyClick?: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onForeignKeyOpenTab?: (foreignKey: ForeignKeyInfo, value: unknown) => void
}

export function FKCellValue({
  value,
  foreignKey,
  onForeignKeyClick,
  onForeignKeyOpenTab
}: FKCellValueProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">NULL</span>
  }

  const stringValue = String(value)
  const isLong = stringValue.length > 30
  const displayValue = isLong ? stringValue.substring(0, 30) + '...' : stringValue

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent bubbling to parent's double-click handler
    if (e.metaKey || e.ctrlKey) {
      // Cmd+Click: Open in new tab
      onForeignKeyOpenTab?.(foreignKey, value)
    } else {
      // Normal click: Open panel
      onForeignKeyClick?.(foreignKey, value)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className="group flex items-center gap-1 text-left text-blue-400 hover:text-blue-300 hover:underline cursor-pointer font-mono text-xs px-1 -mx-1 rounded transition-colors"
          >
            <span className="truncate max-w-[200px]">{displayValue}</span>
            <ExternalLink className="size-3 opacity-0 group-hover:opacity-70 shrink-0 transition-opacity" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium">View in {foreignKey.referencedTable}</p>
            <p className="text-[10px] text-muted-foreground">
              Click to open panel, ⌘+Click for new tab
            </p>
            <pre className="text-xs text-muted-foreground font-mono mt-1">{stringValue}</pre>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
