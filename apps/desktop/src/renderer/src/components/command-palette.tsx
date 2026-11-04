import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AiIcon,
  BookmarkIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DatabaseIcon,
  EditIcon,
  FileCodeIcon,
  HistoryIcon,
  KeyboardIcon,
  LayoutGridIcon,
  MonitorIcon,
  MoonIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon
} from '@/components/icons'

import { useTheme } from '@/components/theme-provider'
import { DatabaseIcon as DatabaseBrandIcon } from '@/components/database-icons'
import { useConnectionStore, useTabStore, useSettingsStore } from '@/stores'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { useSavedQueryStore } from '@/stores/saved-queries-store'
import { useAIStore } from '@/stores/ai-store'
import {
  cn,
  keys,
  useSidebar,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@data-peek/ui'
import type { SavedQuery } from '@shared/index'
import { fuzzyFilter, getQueryType } from '@/lib/command-search'

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

// Query type badge colors
const queryTypeColors: Record<string, string> = {
  SELECT: 'bg-cat-blue/10 text-cat-blue',
  INSERT: 'bg-cat-green/10 text-cat-green',
  UPDATE: 'bg-cat-yellow/10 text-cat-yellow',
  DELETE: 'bg-destructive/10 text-destructive',
  CREATE: 'bg-cat-purple/10 text-cat-purple',
  ALTER: 'bg-cat-purple/10 text-cat-purple',
  DROP: 'bg-cat-purple/10 text-cat-purple',
  EXPLAIN: 'bg-cat-orange/10 text-cat-orange',
  SQL: 'bg-muted-foreground/10 text-muted-foreground'
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
  const selectConnection = useConnectionStore((s) => s.selectConnection)
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
      selectConnection(connectionId)
      onClose()
    },
    [selectConnection, onClose]
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
    return savedQueries.toSorted((a, b) => {
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
              type="button"
              onClick={popPage}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <CaretLeftIcon className="size-3" />
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
                  <AiIcon className="text-primary" />
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
                  <AiIcon className="text-primary" />
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
                  <DatabaseIcon className="text-muted-foreground" />
                  <span>Connections</span>
                  <CaretRightIcon className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                {/* Quick access to top 3 connections */}
                {connections.slice(0, 3).map((conn, index) => (
                  <CommandItem
                    key={conn.id}
                    value={`connection-quick-${conn.name}`}
                    keywords={[conn.dbType, conn.host || '', conn.database]}
                    onSelect={() => handleSelectConnection(conn.id)}
                  >
                    <DatabaseBrandIcon dbType={conn.dbType} className="size-4" />
                    <span className="truncate">{conn.name}</span>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-2 text-[10px] text-success">Active</span>
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
                  <PlusIcon className="text-muted-foreground" />
                  <span>New Query Tab</span>
                  <CommandShortcut>{keys.mod}T</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="saved-queries-menu"
                  keywords={['bookmark', 'favorites', 'history', 'pinned']}
                  onSelect={() => pushPage('saved-queries')}
                >
                  <BookmarkIcon className="text-muted-foreground" />
                  <span>Saved Queries</span>
                  <CaretRightIcon className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                <CommandItem
                  value="query-time-machine"
                  keywords={['history', 'snapshot', 'timeline', 'diff', 'runs', 'past']}
                  onSelect={() => {
                    const { activeTabId, getTab } = useTabStore.getState()
                    const activeTab = activeTabId ? getTab(activeTabId) : null
                    if (
                      activeTab?.type === 'query' &&
                      useSettingsStore.getState().timeMachineEnabled
                    ) {
                      const tm = useTimeMachineStore.getState()
                      if (tm.getState(activeTab.id)?.open) tm.closeStrip(activeTab.id)
                      else tm.openStrip(activeTab.id)
                    }
                    onClose()
                  }}
                >
                  <HistoryIcon className="text-muted-foreground" />
                  <span>Toggle Time Machine</span>
                  <CommandShortcut>
                    {keys.mod}
                    {keys.shift}H
                  </CommandShortcut>
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
                  <SettingsIcon className="text-muted-foreground" />
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
                  <LayoutGridIcon className="text-muted-foreground" />
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
                  <KeyboardIcon className="text-muted-foreground" />
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
                  <MoonIcon className="text-muted-foreground" />
                  <span>Change Theme</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">{theme}</span>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
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
                    <DatabaseBrandIcon dbType={conn.dbType} className="size-4" />
                    <span className="truncate">{conn.name}</span>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-2 text-[10px] text-success">Active</span>
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
                  <DatabaseIcon className="text-muted-foreground" />
                  <span>All Connections</span>
                  <CaretRightIcon className="ml-auto size-4 text-muted-foreground" />
                </CommandItem>
                <CommandItem
                  value="connections-edit"
                  keywords={['modify', 'change', 'update']}
                  onSelect={() => pushPage('connections:edit')}
                >
                  <EditIcon className="text-muted-foreground" />
                  <span>Edit Connection</span>
                  <CaretRightIcon className="ml-auto size-4 text-muted-foreground" />
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
                    <PlusIcon className="text-muted-foreground" />
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
                  <RefreshIcon className="text-muted-foreground" />
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
                    <PlusIcon className="text-muted-foreground" />
                    <span>Add New Connection</span>
                  </CommandItem>
                )}
                <CommandItem
                  value="connections-edit-existing"
                  keywords={['modify', 'change', 'update', 'edit']}
                  onSelect={() => pushPage('connections:edit')}
                >
                  <EditIcon className="text-muted-foreground" />
                  <span>Edit Connection</span>
                  <CaretRightIcon className="ml-auto size-4 text-muted-foreground" />
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
                  <RefreshIcon className="text-muted-foreground" />
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
                    <DatabaseBrandIcon dbType={conn.dbType} className="size-4" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{conn.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {conn.host}:{conn.port}/{conn.database}
                      </span>
                    </div>
                    {conn.id === activeConnection?.id && (
                      <span className="ml-auto text-[10px] text-success">Active</span>
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
                  <DatabaseBrandIcon dbType={conn.dbType} className="size-4" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{conn.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {conn.host}:{conn.port}/{conn.database}
                    </span>
                  </div>
                  {conn.id === activeConnection?.id && (
                    <span className="ml-auto text-[10px] text-success">Active</span>
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
                        <FileCodeIcon className="text-muted-foreground shrink-0" />
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
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePin(query.id)
                          }}
                          className={cn(
                            'p-1 rounded hover:bg-accent transition-colors',
                            query.isPinned
                              ? 'text-warning'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                          )}
                          title={query.isPinned ? 'Unpin' : 'Pin'}
                        >
                          {query.isPinned ? (
                            <PinOffIcon className="size-3" />
                          ) : (
                            <PinIcon className="size-3" />
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
                <SunIcon className="text-muted-foreground" />
                <span>Light</span>
                {theme === 'light' && <span className="ml-auto text-xs text-primary">Active</span>}
              </CommandItem>
              <CommandItem
                value="theme-dark"
                keywords={['mode', 'night']}
                onSelect={() => {
                  setTheme('dark')
                  onClose()
                }}
              >
                <MoonIcon className="text-muted-foreground" />
                <span>Dark</span>
                {theme === 'dark' && <span className="ml-auto text-xs text-primary">Active</span>}
              </CommandItem>
              <CommandItem
                value="theme-system"
                keywords={['mode', 'auto']}
                onSelect={() => {
                  setTheme('system')
                  onClose()
                }}
              >
                <MonitorIcon className="text-muted-foreground" />
                <span>System</span>
                {theme === 'system' && <span className="ml-auto text-xs text-primary">Active</span>}
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
