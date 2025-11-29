'use client'

import * as React from 'react'
import { Table2, Clock, TrendingUp, Search, GitBranch, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchemaInfo } from '@data-peek/shared'

interface AISuggestionsProps {
  schemas: SchemaInfo[]
  onSelect: (suggestion: string) => void
}

interface Suggestion {
  icon: React.ReactNode
  label: string
  query: string
  color: string
}

export function AISuggestions({ schemas, onSelect }: AISuggestionsProps) {
  // Generate dynamic suggestions based on schema
  const suggestions = React.useMemo(() => {
    const baseSuggestions: Suggestion[] = [
      {
        icon: <Table2 className="size-3" />,
        label: 'Show all tables',
        query: 'What tables are available in this database?',
        color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400'
      },
      {
        icon: <TrendingUp className="size-3" />,
        label: 'Recent records',
        query: 'Show me the most recent records added to the database',
        color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400'
      },
      {
        icon: <Search className="size-3" />,
        label: 'Search data',
        query: 'Help me search for',
        color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400'
      },
      {
        icon: <GitBranch className="size-3" />,
        label: 'Table relationships',
        query: 'What are the relationships between tables?',
        color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400'
      }
    ]

    // Add schema-specific suggestions if tables are available
    if (schemas.length > 0) {
      const allTables = schemas.flatMap((s) => s.tables)

      // Find tables that look like user tables
      const userTable = allTables.find(
        (t) =>
          t.name.toLowerCase().includes('user') ||
          t.name.toLowerCase().includes('account') ||
          t.name.toLowerCase().includes('member')
      )

      if (userTable) {
        baseSuggestions.push({
          icon: <Users className="size-3" />,
          label: `Query ${userTable.name}`,
          query: `Show me all records from ${userTable.name} table`,
          color: 'from-pink-500/20 to-pink-600/10 border-pink-500/30 text-pink-400'
        })
      }

      // Find tables with timestamps for recent activity
      const tableWithTimestamp = allTables.find((t) =>
        t.columns.some((c) =>
          ['created_at', 'updated_at', 'timestamp', 'date'].some((name) =>
            c.name.toLowerCase().includes(name)
          )
        )
      )

      if (tableWithTimestamp) {
        baseSuggestions.push({
          icon: <Clock className="size-3" />,
          label: 'Recent activity',
          query: `Show me the latest entries from ${tableWithTimestamp.name} ordered by most recent`,
          color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400'
        })
      }
    }

    return baseSuggestions.slice(0, 6)
  }, [schemas])

  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion.query)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
            'bg-gradient-to-r border',
            'text-[11px] font-medium',
            'transition-all duration-200',
            'hover:scale-[1.02] hover:shadow-md',
            'active:scale-[0.98]',
            suggestion.color,
            // Staggered animation
            'animate-in fade-in-0 slide-in-from-bottom-2',
            'opacity-0'
          )}
          style={{
            animationDelay: `${index * 50}ms`,
            animationFillMode: 'forwards'
          }}
        >
          {suggestion.icon}
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  )
}
