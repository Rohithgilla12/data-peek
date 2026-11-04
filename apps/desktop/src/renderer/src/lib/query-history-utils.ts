import type { QueryHistoryItem } from '@/stores/query-store'

export type FilterStatus = 'all' | 'success' | 'error'
export type FilterType = 'all' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL'

export function getQueryType(query: string): string {
  const normalized = query.trim().toUpperCase()
  if (normalized.startsWith('SELECT')) return 'SELECT'
  if (normalized.startsWith('INSERT')) return 'INSERT'
  if (normalized.startsWith('UPDATE')) return 'UPDATE'
  if (normalized.startsWith('DELETE')) return 'DELETE'
  if (normalized.startsWith('CREATE')) return 'CREATE'
  if (normalized.startsWith('ALTER')) return 'ALTER'
  if (normalized.startsWith('DROP')) return 'DROP'
  if (normalized.startsWith('EXPLAIN')) return 'EXPLAIN'
  return 'SQL'
}

export function getQueryTypeColor(type: string, withBorder = false): string {
  switch (type) {
    case 'SELECT':
      return `bg-cat-blue/10 text-cat-blue${withBorder ? ' border-cat-blue/20' : ''}`
    case 'INSERT':
      return `bg-cat-green/10 text-cat-green${withBorder ? ' border-cat-green/20' : ''}`
    case 'UPDATE':
      return `bg-cat-yellow/10 text-cat-yellow${withBorder ? ' border-cat-yellow/20' : ''}`
    case 'DELETE':
      return `bg-destructive/10 text-destructive${withBorder ? ' border-destructive/20' : ''}`
    case 'CREATE':
    case 'ALTER':
    case 'DROP':
      return `bg-cat-purple/10 text-cat-purple${withBorder ? ' border-cat-purple/20' : ''}`
    case 'EXPLAIN':
      return `bg-cat-orange/10 text-cat-orange${withBorder ? ' border-cat-orange/20' : ''}`
    default:
      return `bg-muted text-muted-foreground${withBorder ? ' border-border' : ''}`
  }
}

export interface HistoryFilterOptions {
  searchQuery: string
  filterStatus: FilterStatus
  filterType: FilterType
  connectionId?: string | null
}

export function filterHistory(
  history: QueryHistoryItem[],
  options: HistoryFilterOptions
): QueryHistoryItem[] {
  const { searchQuery, filterStatus, filterType, connectionId } = options

  return history.filter((item) => {
    if (searchQuery && !item.query.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    if (filterStatus !== 'all' && item.status !== filterStatus) {
      return false
    }

    if (filterType !== 'all') {
      const queryType = getQueryType(item.query)
      if (filterType === 'DDL') {
        if (!['CREATE', 'ALTER', 'DROP'].includes(queryType)) return false
      } else if (queryType !== filterType) {
        return false
      }
    }

    if (connectionId && connectionId !== 'all' && item.connectionId !== connectionId) {
      return false
    }

    return true
  })
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function truncateQuery(query: string, maxLength = 40): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.substring(0, maxLength) + '...'
}

export function groupHistoryByDate(
  history: QueryHistoryItem[]
): { label: string; items: QueryHistoryItem[] }[] {
  const groups: { label: string; items: QueryHistoryItem[] }[] = []
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const todayItems = history.filter((item) => {
    const itemDate = new Date(item.timestamp)
    return itemDate.toDateString() === today.toDateString()
  })

  const yesterdayItems = history.filter((item) => {
    const itemDate = new Date(item.timestamp)
    return itemDate.toDateString() === yesterday.toDateString()
  })

  const olderItems = history.filter((item) => {
    const itemDate = new Date(item.timestamp)
    return (
      itemDate.toDateString() !== today.toDateString() &&
      itemDate.toDateString() !== yesterday.toDateString()
    )
  })

  if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems })
  if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems })
  if (olderItems.length > 0) groups.push({ label: 'Older', items: olderItems })

  return groups
}
