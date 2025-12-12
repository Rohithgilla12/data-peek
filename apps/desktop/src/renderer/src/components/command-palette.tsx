'use client'

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Sparkles,
  Database,
  FileCode2,
  Settings,
  Moon,
  Sun,
  Monitor,
  Plus,
  LayoutGrid,
  ChevronRight,
  Bookmark,
  RefreshCw,
  Keyboard,
  ChevronLeft,
  Pin,
  PinOff,
  Pencil
} from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@/components/ui/command'
import { useTheme } from '@/components/theme-provider'
import { DatabaseIcon } from '@/components/database-icons'
import { useConnectionStore, useTabStore } from '@/stores'
import { useSavedQueryStore } from '@/stores/saved-queries-store'
import { useAIStore } from '@/stores/ai-store'
import { cn, keys } from '@/lib/utils'
import { useSidebar } from '@/components/ui/sidebar'
import type { SavedQuery } from '@shared/index'

// Page types for navigation
type CommandPage =
  | 'home'
  | 'connections'
  | 'connections:switch'
  | 'connections:edit'
  | 'saved-queries'
  | 'appearance'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenAddConnection?: () => void
  onOpenEditConnection?: (id: string) => void
  initialPage?: CommandPage
}

// Custom fuzzy filter for cmdk with smart scoring
function fuzzyFilter(value: string, search: string, keywords?: string[]): number {
  if (!search) return 1

  const searchLower = search.toLowerCase()
  const valueLower = value.toLowerCase()

  // Combine value with keywords for searching
  const keywordsLower = keywords?.map((k) => k.toLowerCase()).join(' ') || ''
  const searchableText = `${valueLower} ${keywordsLower}`

  // Exact match - highest priority
  if (valueLower === searchLower) return 1

  // Starts with - very high priority
  if (valueLower.startsWith(searchLower)) return 0.95

  // Acronym match (e.g., "nqt" matches "New Query Tab")
  const words = value.split(/\s+/)
  const acronym = words.map((w) => w[0]?.toLowerCase() || '').join('')
  if (acronym.startsWith(searchLower)) return 0.9
  if (acronym.includes(searchLower)) return 0.85

  // Contains as substring - good match
  if (valueLower.includes(searchLower)) return 0.8
  if (keywordsLower.includes(searchLower)) return 0.75

  // Smart fuzzy match with scoring based on character proximity
  const fuzzyScore = calculateFuzzyScore(searchableText, searchLower)
  if (fuzzyScore > 0) return fuzzyScore

  return 0
}

// Calculate fuzzy match score with bonuses for consecutive matches and word boundaries
function calculateFuzzyScore(text: string, search: string): number {
  let textIndex = 0
  let searchIndex = 0
  let score = 0
  let consecutiveBonus = 0
  let lastMatchIndex = -2 // Start at -2 so first match doesn't get consecutive bonus
  const matchPositions: number[] = []

  while (textIndex < text.length && searchIndex < search.length) {
    if (text[textIndex] === search[searchIndex]) {
      matchPositions.push(textIndex)

      // Bonus for consecutive characters (e.g., "feed" in "feedback")
      if (textIndex === lastMatchIndex + 1) {
        consecutiveBonus += 0.05
      }

      // Bonus for matching at word boundaries (start of word)
      if (textIndex === 0 || text[textIndex - 1] === ' ' || text[textIndex - 1] === '-' || text[textIndex - 1] === '_') {
        score += 0.03
      }

      lastMatchIndex = textIndex
      searchIndex++
    }
    textIndex++
  }

  // Did we match all search characters?
  if (searchIndex !== search.length) return 0

  // Base score for matching all characters
  const baseScore = 0.6

  // Bonus for shorter text (more relevant match)
  const lengthBonus = Math.max(0, 0.1 - (text.length - search.length) * 0.005)

  // Bonus for matches being close together
  const spread = matchPositions.length > 1
    ? matchPositions[matchPositions.length - 1] - matchPositions[0]
    : 0
  const compactnessBonus = Math.max(0, 0.1 - spread * 0.01)

  return Math.min(0.7, baseScore + consecutiveBonus + lengthBonus + compactnessBonus + score)
}

// Get query type from SQL
function getQueryType(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  if (trimmed.startsWith('SELECT')) return 'SELECT'
  if (trimmed.startsWith('INSERT')) return 'INSERT'
  if (trimmed.startsWith('UPDATE')) return 'UPDATE'
  if (trimmed.startsWith('DELETE')) return 'DELETE'
  if (trimmed.startsWith('CREATE')) return 'CREATE'
  if (trimmed.startsWith('ALTER')) return 'ALTER'
  if (trimmed.startsWith('DROP')) return 'DROP'
  if (trimmed.startsWith('EXPLAIN')) return 'EXPLAIN'
  return 'SQL'
}

// Query type badge colors
const queryTypeColors: Record<string, string> = {
  SELECT: 'bg-blue-500/20 text-blue-400',
  INSERT: 'bg-green-500/20 text-green-400',
  UPDATE: 'bg-yellow-500/20 text-yellow-400',
  DELETE: 'bg-red-500/20 text-red-400',
  CREATE: 'bg-purple-500/20 text-purple-400',
  ALTER: 'bg-purple-500/20 text-purple-400',
  DROP: 'bg-purple-500/20 text-purple-400',
  EXPLAIN: 'bg-orange-500/20 text-orange-400',
  SQL: 'bg-zinc-500/20 text-zinc-400'
}

export function CommandPalette({
  isOpen,
  onClose,
  onOpenAddConnection,
  onOpenEditConnection,
  initialPage = 'home'
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const { setTheme, theme } = useTheme()

  // Stores
  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const connections = useConnectionStore((s) => s.connections)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const fetchSchemas = useConnectionStore((s) => s.fetchSchemas)

  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)

  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const incrementUsage = useSavedQueryStore((s) => s.incrementUsage)
  const togglePin = useSavedQueryStore((s) => s.togglePin)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const isInitialized = useSavedQueryStore((s) => s.isInitialized)

  const openAIPanel = useAIStore((s) => s.openPanel)
  const openAISettings = useAIStore((s) => s.openSettings)

  // State
  const [search, setSearch] = React.useState('')
  const [pages, setPages] = React.useState<CommandPage[]>([initialPage])
  const activePage = pages[pages.length - 1]
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Navigation helpers
  const pushPage = React.useCallback((page: CommandPage) => {
    setPages((prev) => [...prev, page])
    setSearch('')
  }, [])

  const popPage = React.useCallback(() => {
    setPages((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
    setSearch('')
  }, [])

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setPages([initialPage])
      setSearch('')
      // Initialize saved queries when opening saved-queries page
      if (initialPage === 'saved-queries' && !isInitialized) {
        initializeSavedQueries()
      }
    }
  }, [isOpen, initialPage, isInitialized, initializeSavedQueries])

  // Initialize saved queries when navigating to that page
  React.useEffect(() => {
    if (activePage === 'saved-queries' && !isInitialized) {
      initializeSavedQueries()
    }
  }, [activePage, isInitialized, initializeSavedQueries])

  // Handle connection switching
  const handleSelectConnection = React.useCallback(
    (connectionId: string) => {
      setConnectionStatus(connectionId, { isConnecting: true, error: undefined })
      setTimeout(() => {
        setConnectionStatus(connectionId, { isConnecting: false, isConnected: true })
        setActiveConnection(connectionId)
      }, 500)
      onClose()
    },
    [setConnectionStatus, setActiveConnection, onClose]
  )

  // Handle saved query selection
  const handleSelectQuery = React.useCallback(
    (query: SavedQuery) => {
      const tabId = createQueryTab(query.connectionId || activeConnection?.id || null, query.query)
      setActiveTab(tabId)
      incrementUsage(query.id)
      onClose()
    },
    [createQueryTab, activeConnection, setActiveTab, incrementUsage, onClose]
  )

  // Sort saved queries: pinned first, then by last used
  const sortedQueries = React.useMemo(() => {
    return [...savedQueries].sort((a, b) => {
      // Pinned first
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      // Then by last used
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
    })
  }, [savedQueries])

  // Group queries by folder for display
  const groupedQueries = React.useMemo(() => {
    const groups: Record<string, SavedQuery[]> = {}
    const pinnedQueries = sortedQueries.filter((q) => q.isPinned)
    const unpinnedQueries = sortedQueries.filter((q) => !q.isPinned)

    // Add pinned group if any
    if (pinnedQueries.length > 0) {
      groups['Pinned'] = pinnedQueries
    }

    // Group unpinned by folder
    unpinnedQueries.forEach((q) => {
      const folder = q.folder || 'Ungrouped'
      if (!groups[folder]) groups[folder] = []
      groups[folder].push(q)
    })

    return groups
  }, [sortedQueries])

  // Breadcrumb for nested pages
  const getBreadcrumb = () => {
    switch (activePage) {
      case 'connections':
        return 'Connections'
      case 'connections:switch':
        return 'Connections → Switch'
      case 'connections:edit':
        return 'Connections → Edit'
      case 'saved-queries':
        return 'Saved Queries'
      case 'appearance':
        return 'Appearance'
      default:
        return null
    }
  }

  // Placeholder text
  const getPlaceholder = () => {
    switch (activePage) {
      case 'connections':
      case 'connections:switch':
        return 'Search connections...'
      case 'connections:edit':
        return 'Select connection to edit...'
      case 'saved-queries':
        return 'Search saved queries...'
      case 'appearance':
        return 'Select theme...'
      default:
        return 'Type a command or search...'
    }
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Command
        filter={(value, search, keywords) => fuzzyFilter(value, search, keywords)}
        onKeyDown={(e) => {
          // Backspace on empty search goes back
          if (e.key === 'Backspace' && !search && pages.length > 1) {
            e.preventDefault()
            popPage()
          }
          // Escape goes back or closes
          if (e.key === 'Escape') {
            e.preventDefault()
            if (pages.length > 1) {
              popPage()
            } else {
              onClose()
            }
          }
        }}
      >
        {/* Breadcrumb header for nested pages */}
        {activePage !== 'home' && (
          <div className="flex items-center gap-2 px-3 py-2 border-b text-xs text-muted-foreground">
            <button
              onClick={popPage}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-3" />
              Back
            </button>
            <span className="text-muted-foreground/50">|</span>
            <span>{getBreadcrumb()}</span>
          </div>
        )}

        <CommandInput
          ref={inputRef}
          placeholder={getPlaceholder()}
          value={search}
          onValueChange={setSearch}
        />

        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* HOME PAGE */}
          {activePage === 'home' && (
            <>
              {/* AI Commands */}
              <CommandGroup heading="AI">
                <CommandItem
                  value="ai-open"
                  keywords={['chat', 'assistant', 'generate', 'sql']}
                  onSelect={() => {
                    openAIPanel()
                    onClose()
                  }}
                >
                  <Sparkles className="text-blue-400" />
                  <span>Open AI Assistant</span>
                  <CommandShortcut>{keys.mod}I</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="ai-settings"
                  keywords={['api', 'key', 'provider', 'openai', 'anthropic']}
                  onSelect={() => {
                    openAISettings()
                    onClose()
                  }}
                >
                  <Sparkles className="text-blue-400" />
                  <span>AI Settings</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Connections - with submenu */}
              <CommandGroup heading="Connections">
                <CommandItem
                  value="connections-menu"
                  keywords={['database', 'connect', 'switch', 'manage']}
                  onSelect={() => pushPage('connections')}
                >
                  <Database className="text-emerald-400" />
                  <span>Connections</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                {/* Quick access to top 3 connections */}
                {connections.slice(0, 3).map((conn, index) => (
                  <CommandItem
                    key={conn.id}
                    value={`connection-quick-${conn.name}`}
                    keywords={[conn.dbType, conn.host || '', conn.database]}
                    onSelect={() => handleSelectConnection(conn.id)}
                  >
                    <DatabaseIcon dbType={conn.dbType} className="size-4" />
                    <span className="truncate">{conn.name}</span>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-2 text-[10px] text-emerald-400">Active</span>
                    )}
                    <CommandShortcut>
                      {keys.mod}
                      {keys.shift}
                      {index + 1}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              {/* Queries */}
              <CommandGroup heading="Queries">
                <CommandItem
                  value="query-new"
                  keywords={['tab', 'editor', 'sql', 'create']}
                  onSelect={() => {
                    const tabId = createQueryTab(activeConnection?.id || null)
                    setActiveTab(tabId)
                    onClose()
                  }}
                >
                  <Plus className="text-amber-400" />
                  <span>New Query Tab</span>
                  <CommandShortcut>{keys.mod}T</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="saved-queries-menu"
                  keywords={['bookmark', 'favorites', 'history', 'pinned']}
                  onSelect={() => pushPage('saved-queries')}
                >
                  <Bookmark className="text-amber-400" />
                  <span>Saved Queries</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Navigation */}
              <CommandGroup heading="Navigation">
                <CommandItem
                  value="nav-settings"
                  keywords={['preferences', 'config']}
                  onSelect={() => {
                    navigate({ to: '/settings' })
                    onClose()
                  }}
                >
                  <Settings className="text-purple-400" />
                  <span>Settings</span>
                </CommandItem>
                <CommandItem
                  value="nav-sidebar"
                  keywords={['panel', 'hide', 'show']}
                  onSelect={() => {
                    toggleSidebar()
                    onClose()
                  }}
                >
                  <LayoutGrid className="text-purple-400" />
                  <span>Toggle Sidebar</span>
                  <CommandShortcut>{keys.mod}B</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="nav-shortcuts"
                  keywords={['hotkeys', 'keybindings']}
                  onSelect={() => {
                    navigate({ to: '/settings' })
                    onClose()
                  }}
                >
                  <Keyboard className="text-purple-400" />
                  <span>Keyboard Shortcuts</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Appearance - with submenu */}
              <CommandGroup heading="Appearance">
                <CommandItem
                  value="appearance-menu"
                  keywords={['theme', 'dark', 'light', 'mode']}
                  onSelect={() => pushPage('appearance')}
                >
                  <Moon className="text-pink-400" />
                  <span>Change Theme</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">{theme}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {/* CONNECTIONS PAGE */}
          {activePage === 'connections' && (
            <>
              <CommandGroup heading="Quick Switch">
                {connections.slice(0, 5).map((conn, index) => (
                  <CommandItem
                    key={conn.id}
                    value={`switch-${conn.name}-${conn.id}`}
                    keywords={[conn.dbType, conn.host || '', conn.database]}
                    onSelect={() => handleSelectConnection(conn.id)}
                  >
                    <DatabaseIcon dbType={conn.dbType} className="size-4" />
                    <span className="truncate">{conn.name}</span>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-2 text-[10px] text-emerald-400">Active</span>
                    )}
                    {index < 9 && (
                      <CommandShortcut>
                        {keys.mod}
                        {keys.shift}
                        {index + 1}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Manage">
                <CommandItem
                  value="connections-all"
                  keywords={['switch', 'browse', 'list']}
                  onSelect={() => pushPage('connections:switch')}
                >
                  <Database className="text-emerald-400" />
                  <span>All Connections</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                <CommandItem
                  value="connections-edit"
                  keywords={['modify', 'change', 'update']}
                  onSelect={() => pushPage('connections:edit')}
                >
                  <Pencil className="text-emerald-400" />
                  <span>Edit Connection</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                {onOpenAddConnection && (
                  <CommandItem
                    value="connections-add"
                    keywords={['new', 'create']}
                    onSelect={() => {
                      onOpenAddConnection()
                      onClose()
                    }}
                  >
                    <Plus className="text-emerald-400" />
                    <span>Add New Connection</span>
                  </CommandItem>
                )}
                <CommandItem
                  value="connections-refresh"
                  keywords={['reload', 'schema', 'tables']}
                  onSelect={() => {
                    if (activeConnection) {
                      fetchSchemas(activeConnection.id)
                    }
                    onClose()
                  }}
                >
                  <RefreshCw className="text-emerald-400" />
                  <span>Refresh Schema</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {/* CONNECTIONS:SWITCH PAGE - All connections */}
          {activePage === 'connections:switch' && (
            <>
              {/* Quick actions at the top */}
              <CommandGroup heading="Actions">
                {onOpenAddConnection && (
                  <CommandItem
                    value="connections-add-new"
                    keywords={['new', 'create', 'add']}
                    onSelect={() => {
                      onOpenAddConnection()
                      onClose()
                    }}
                  >
                    <Plus className="text-emerald-400" />
                    <span>Add New Connection</span>
                  </CommandItem>
                )}
                <CommandItem
                  value="connections-edit-existing"
                  keywords={['modify', 'change', 'update', 'edit']}
                  onSelect={() => pushPage('connections:edit')}
                >
                  <Pencil className="text-emerald-400" />
                  <span>Edit Connection</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                <CommandItem
                  value="connections-refresh-schema"
                  keywords={['reload', 'schema', 'tables']}
                  onSelect={() => {
                    if (activeConnection) {
                      fetchSchemas(activeConnection.id)
                    }
                    onClose()
                  }}
                >
                  <RefreshCw className="text-emerald-400" />
                  <span>Refresh Schema</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="All Connections">
                {connections.map((conn, index) => (
                  <CommandItem
                    key={conn.id}
                    value={`switch-all-${conn.name}-${conn.id}`}
                    keywords={[conn.dbType, conn.host || '', conn.database]}
                    onSelect={() => handleSelectConnection(conn.id)}
                  >
                    <DatabaseIcon dbType={conn.dbType} className="size-4" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{conn.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {conn.host}:{conn.port}/{conn.database}
                      </span>
                    </div>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-auto text-[10px] text-emerald-400">Active</span>
                    )}
                    {index < 9 && (
                      <CommandShortcut>
                        {keys.mod}
                        {keys.shift}
                        {index + 1}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* CONNECTIONS:EDIT PAGE - Select connection to edit */}
          {activePage === 'connections:edit' && (
            <CommandGroup heading="Select Connection to Edit">
              {connections.map((conn) => (
                <CommandItem
                  key={conn.id}
                  value={`edit-${conn.name}-${conn.id}`}
                  keywords={[conn.dbType, conn.host || '', conn.database]}
                  onSelect={() => {
                    onOpenEditConnection?.(conn.id)
                    onClose()
                  }}
                >
                  <DatabaseIcon dbType={conn.dbType} className="size-4" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{conn.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {conn.host}:{conn.port}/{conn.database}
                    </span>
                  </div>
                  {conn.id === activeConnection?.id && (
                    <span className="ml-auto text-[10px] text-emerald-400">Active</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* SAVED QUERIES PAGE */}
          {activePage === 'saved-queries' && (
            <>
              {Object.entries(groupedQueries).map(([folder, queries]) => (
                <CommandGroup key={folder} heading={folder}>
                  {queries.map((query) => {
                    const queryType = getQueryType(query.query)
                    return (
                      <CommandItem
                        key={query.id}
                        value={`query-${query.name}-${query.id}`}
                        keywords={[...query.tags, query.description || '', queryType]}
                        onSelect={() => handleSelectQuery(query)}
                        className="group"
                      >
                        <FileCode2 className="text-amber-400 shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{query.name}</span>
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                queryTypeColors[queryType]
                              )}
                            >
                              {queryType}
                            </span>
                          </div>
                          {query.description && (
                            <span className="text-xs text-muted-foreground truncate">
                              {query.description}
                            </span>
                          )}
                        </div>
                        {/* Pin/Unpin button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePin(query.id)
                          }}
                          className={cn(
                            'p-1 rounded hover:bg-accent transition-colors',
                            query.isPinned
                              ? 'text-amber-400'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                          )}
                          title={query.isPinned ? 'Unpin' : 'Pin'}
                        >
                          {query.isPinned ? (
                            <PinOff className="size-3" />
                          ) : (
                            <Pin className="size-3" />
                          )}
                        </button>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
              {savedQueries.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No saved queries yet
                </div>
              )}
            </>
          )}

          {/* APPEARANCE PAGE */}
          {activePage === 'appearance' && (
            <CommandGroup heading="Theme">
              <CommandItem
                value="theme-light"
                keywords={['mode', 'bright']}
                onSelect={() => {
                  setTheme('light')
                  onClose()
                }}
              >
                <Sun className="text-pink-400" />
                <span>Light</span>
                {theme === 'light' && <span className="ml-auto text-xs text-pink-400">Active</span>}
              </CommandItem>
              <CommandItem
                value="theme-dark"
                keywords={['mode', 'night']}
                onSelect={() => {
                  setTheme('dark')
                  onClose()
                }}
              >
                <Moon className="text-pink-400" />
                <span>Dark</span>
                {theme === 'dark' && <span className="ml-auto text-xs text-pink-400">Active</span>}
              </CommandItem>
              <CommandItem
                value="theme-system"
                keywords={['mode', 'auto']}
                onSelect={() => {
                  setTheme('system')
                  onClose()
                }}
              >
                <Monitor className="text-pink-400" />
                <span>System</span>
                {theme === 'system' && (
                  <span className="ml-auto text-xs text-pink-400">Active</span>
                )}
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">↵</kbd>
              select
            </span>
            {pages.length > 1 && (
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">⌫</kbd>
                back
              </span>
            )}
          </div>
          <span>data-peek</span>
        </div>
      </Command>
    </CommandDialog>
  )
}

// Re-export icons for backward compatibility
export {
  Sparkles,
  Database,
  FileCode2,
  Settings,
  Moon,
  Sun,
  Monitor,
  Plus,
  LayoutGrid,
  Bookmark,
  RefreshCw,
  Keyboard
}
