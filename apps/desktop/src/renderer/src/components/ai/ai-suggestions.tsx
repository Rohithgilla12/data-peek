import * as React from 'react'
import {
  ClockIcon,
  GitBranchIcon,
  SearchIcon,
  TableIcon,
  TrendUpIcon,
  UsersIcon
} from '@/components/icons'
import { cn } from '@data-peek/ui'
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
        icon: <TableIcon className="size-3" />,
        label: 'Show all tables',
        query: 'What tables are available in this database?',
        color: 'bg-primary/10 border-primary/30 text-primary'
      },
      {
        icon: <TrendUpIcon className="size-3" />,
        label: 'Recent records',
        query: 'Show me the most recent records added to the database',
        color: 'bg-primary/10 border-primary/30 text-primary'
      },
      {
        icon: <SearchIcon className="size-3" />,
        label: 'Search data',
        query: 'Help me search for',
        color: 'bg-primary/10 border-primary/30 text-primary'
      },
      {
        icon: <GitBranchIcon className="size-3" />,
        label: 'Table relationships',
        query: 'What are the relationships between tables?',
        color: 'bg-primary/10 border-primary/30 text-primary'
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
          icon: <UsersIcon className="size-3" />,
          label: `Query ${userTable.name}`,
          query: `Show me all records from ${userTable.name} table`,
          color: 'bg-primary/10 border-primary/30 text-primary'
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
          icon: <ClockIcon className="size-3" />,
          label: 'Recent activity',
          query: `Show me the latest entries from ${tableWithTimestamp.name} ordered by most recent`,
          color: 'bg-primary/10 border-primary/30 text-primary'
        })
      }
    }

    return baseSuggestions.slice(0, 6)
  }, [schemas])

  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
      {suggestions.map((suggestion, index) => (
        <button
          type="button"
          key={suggestion.query}
          onClick={() => onSelect(suggestion.query)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
            'border',
            'text-2xs font-medium',
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
