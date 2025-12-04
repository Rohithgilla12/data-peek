import {
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  Outlet,
  Link,
  useNavigate
} from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Moon, Sun, Monitor, Sparkles, Command } from 'lucide-react'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import {
  CommandPalette,
  type CommandItem,
  Database,
  Settings,
  Plus,
  Bookmark,
  RefreshCw,
  Keyboard
} from '@/components/command-palette'
import { SavedQueriesDialog } from '@/components/saved-queries-dialog'
import { DatabaseIcon } from '@/components/database-icons'
import { AppSidebar } from '@/components/app-sidebar'
import { NavActions } from '@/components/nav-actions'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { TabContainer } from '@/components/tab-container'
import { ConnectionPicker } from '@/components/connection-picker'
import { LicenseStatusIndicator } from '@/components/license-status-indicator'
import { LicenseActivationModal } from '@/components/license-activation-modal'
import { LicenseSettingsModal } from '@/components/license-settings-modal'
import { AIChatPanel, AISettingsModal } from '@/components/ai'
import { useAIStore } from '@/stores/ai-store'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useConnectionStore, useLicenseStore, useSettingsStore, useTabStore } from '@/stores'
import { cn, keys } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Inner layout component that has access to sidebar context
function LayoutContent() {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const { setTheme } = useTheme()

  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const connections = useConnectionStore((s) => s.connections)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const fetchSchemas = useConnectionStore((s) => s.fetchSchemas)
  const [isConnectionPickerOpen, setIsConnectionPickerOpen] = useState(false)

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  // Saved queries dialog state
  const [isSavedQueriesOpen, setIsSavedQueriesOpen] = useState(false)

  // License modal states from store
  const isActivationModalOpen = useLicenseStore((s) => s.isActivationModalOpen)
  const closeActivationModal = useLicenseStore((s) => s.closeActivationModal)
  const isSettingsModalOpen = useLicenseStore((s) => s.isSettingsModalOpen)
  const closeSettingsModal = useLicenseStore((s) => s.closeSettingsModal)

  // AI states from store
  const isAIPanelOpen = useAIStore((s) => s.isPanelOpen)
  const toggleAIPanel = useAIStore((s) => s.togglePanel)
  const openAIPanel = useAIStore((s) => s.openPanel)
  const closeAIPanel = useAIStore((s) => s.closePanel)
  const isAISettingsOpen = useAIStore((s) => s.isSettingsOpen)
  const openAISettings = useAIStore((s) => s.openSettings)
  const closeAISettings = useAIStore((s) => s.closeSettings)
  const aiConfig = useAIStore((s) => s.config)
  const isAIConfigured = useAIStore((s) => s.isConfigured)
  const setAIConfig = useAIStore((s) => s.setConfig)

  // Get schemas for AI context
  const schemas = useConnectionStore((s) => s.schemas)

  // Tab store for opening SQL in new tab
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)

  // Handle opening SQL in a new tab (without execution)
  const handleAIOpenInTab = useCallback(
    (sql: string) => {
      const tabId = createQueryTab(activeConnection?.id || null, sql)
      setActiveTab(tabId)
    },
    [activeConnection, createQueryTab, setActiveTab]
  )

  // Handle connection switching
  const handleSelectConnection = useCallback(
    (connectionId: string) => {
      setConnectionStatus(connectionId, { isConnecting: true, error: undefined })
      setTimeout(() => {
        setConnectionStatus(connectionId, { isConnecting: false, isConnected: true })
        setActiveConnection(connectionId)
      }, 500)
    },
    [setConnectionStatus, setActiveConnection]
  )

  // Command palette commands
  const commands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [
      // AI Commands
      {
        id: 'ai-open',
        label: 'Open AI Assistant',
        description: 'Chat with AI to generate SQL queries',
        icon: <Sparkles className="size-4 text-blue-400" />,
        shortcut: [keys.mod, 'I'],
        category: 'AI',
        action: () => openAIPanel(),
        keywords: ['chat', 'assistant', 'generate', 'sql']
      },
      {
        id: 'ai-settings',
        label: 'AI Settings',
        description: 'Configure AI provider and API key',
        icon: <Sparkles className="size-4 text-blue-400" />,
        category: 'AI',
        action: () => openAISettings(),
        keywords: ['api', 'key', 'provider', 'openai', 'anthropic']
      },

      // Connection Commands
      {
        id: 'connection-picker',
        label: 'Switch Connection',
        description: 'Open connection picker',
        icon: <Database className="size-4 text-emerald-400" />,
        shortcut: [keys.mod, 'P'],
        category: 'Connections',
        action: () => setIsConnectionPickerOpen(true),
        keywords: ['database', 'connect', 'switch']
      },
      {
        id: 'connection-refresh',
        label: 'Refresh Schema',
        description: 'Reload database schema',
        icon: <RefreshCw className="size-4 text-emerald-400" />,
        category: 'Connections',
        action: () => {
          if (activeConnection) {
            fetchSchemas(activeConnection.id)
          }
        },
        keywords: ['reload', 'schema', 'tables']
      },

      // Query Commands
      {
        id: 'query-new',
        label: 'New Query Tab',
        description: 'Create a new query tab',
        icon: <Plus className="size-4 text-amber-400" />,
        shortcut: [keys.mod, 'T'],
        category: 'Queries',
        action: () => {
          const tabId = createQueryTab(activeConnection?.id || null)
          setActiveTab(tabId)
        },
        keywords: ['tab', 'editor', 'sql']
      },
      {
        id: 'query-saved',
        label: 'Saved Queries',
        description: 'Browse and load saved queries',
        icon: <Bookmark className="size-4 text-amber-400" />,
        category: 'Queries',
        action: () => setIsSavedQueriesOpen(true),
        keywords: ['bookmark', 'favorites', 'history']
      },

      // Navigation Commands
      {
        id: 'nav-settings',
        label: 'Settings',
        description: 'Open application settings',
        icon: <Settings className="size-4 text-purple-400" />,
        category: 'Navigation',
        action: () => navigate({ to: '/settings' }),
        keywords: ['preferences', 'config']
      },
      {
        id: 'nav-sidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the sidebar',
        icon: <Command className="size-4 text-purple-400" />,
        shortcut: [keys.mod, 'B'],
        category: 'Navigation',
        action: () => toggleSidebar(),
        keywords: ['panel', 'hide', 'show']
      },
      {
        id: 'nav-shortcuts',
        label: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: <Keyboard className="size-4 text-purple-400" />,
        category: 'Navigation',
        action: () => navigate({ to: '/settings' }),
        keywords: ['hotkeys', 'keybindings']
      },

      // Appearance Commands
      {
        id: 'theme-light',
        label: 'Light Theme',
        description: 'Switch to light mode',
        icon: <Sun className="size-4 text-pink-400" />,
        category: 'Appearance',
        action: () => setTheme('light'),
        keywords: ['mode', 'bright']
      },
      {
        id: 'theme-dark',
        label: 'Dark Theme',
        description: 'Switch to dark mode',
        icon: <Moon className="size-4 text-pink-400" />,
        category: 'Appearance',
        action: () => setTheme('dark'),
        keywords: ['mode', 'night']
      },
      {
        id: 'theme-system',
        label: 'System Theme',
        description: 'Follow system preference',
        icon: <Monitor className="size-4 text-pink-400" />,
        category: 'Appearance',
        action: () => setTheme('system'),
        keywords: ['mode', 'auto']
      }
    ]

    // Add connection quick-switch commands
    connections.slice(0, 9).forEach((conn, index) => {
      cmds.push({
        id: `connection-${conn.id}`,
        label: conn.name,
        description: `Switch to ${conn.dbType} connection`,
        icon: <Database className="size-4 text-emerald-400" />,
        shortcut: [keys.mod, keys.shift, String(index + 1)],
        category: 'Connections',
        action: () => handleSelectConnection(conn.id),
        keywords: [conn.dbType, conn.host || '']
      })
    })

    return cmds
  }, [
    activeConnection,
    connections,
    createQueryTab,
    fetchSchemas,
    handleSelectConnection,
    navigate,
    openAIPanel,
    openAISettings,
    setActiveTab,
    setTheme,
    toggleSidebar
  ])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+K: Open command palette
      if (isMeta && e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setIsCommandPaletteOpen(true)
        return
      }

      // Cmd+P: Open connection picker
      if (isMeta && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        setIsConnectionPickerOpen(true)
        return
      }

      // Cmd+I: Toggle AI panel
      if (isMeta && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        toggleAIPanel()
        return
      }

      // Cmd+Shift+1-9: Switch to connection N
      if (isMeta && e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const connectionIndex = parseInt(e.key) - 1
        if (connections[connectionIndex]) {
          handleSelectConnection(connections[connectionIndex].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connections, handleSelectConnection, toggleAIPanel])

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="titlebar-drag-region flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="flex flex-1 items-center gap-2 px-3">
            <SidebarTrigger className="titlebar-no-drag" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <span className="text-sm font-medium text-muted-foreground">data-peek</span>
            {activeConnection && (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-2 data-[orientation=vertical]:h-4"
                />
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${activeConnection.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
                  />
                  <DatabaseIcon dbType={activeConnection.dbType} className="size-4" />
                  <span className="text-sm text-foreground">{activeConnection.name}</span>
                </div>
              </>
            )}
          </div>
          <div className="titlebar-no-drag ml-auto flex items-center gap-2 px-3">
            {/* Command Palette Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCommandPaletteOpen(true)}
                >
                  <Command className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Command Palette ({keys.mod}+K)</TooltipContent>
            </Tooltip>
            {/* AI Assistant Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-8',
                    isAIConfigured ? 'text-blue-400 hover:text-blue-300' : 'text-muted-foreground'
                  )}
                  onClick={toggleAIPanel}
                >
                  <Sparkles className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">AI Assistant ({keys.mod}+I)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            <LicenseStatusIndicator />
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            <NavActions />
          </div>
        </header>

        <Outlet />
      </SidebarInset>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* Global Connection Picker */}
      <ConnectionPicker open={isConnectionPickerOpen} onOpenChange={setIsConnectionPickerOpen} />

      {/* Saved Queries Dialog */}
      <SavedQueriesDialog open={isSavedQueriesOpen} onOpenChange={setIsSavedQueriesOpen} />

      {/* License Modals */}
      <LicenseActivationModal open={isActivationModalOpen} onOpenChange={closeActivationModal} />
      <LicenseSettingsModal open={isSettingsModalOpen} onOpenChange={closeSettingsModal} />

      {/* AI Assistant Panel */}
      <AIChatPanel
        isOpen={isAIPanelOpen}
        onClose={closeAIPanel}
        onOpenSettings={openAISettings}
        connection={activeConnection || null}
        schemas={schemas}
        isConfigured={isAIConfigured}
        onOpenInTab={handleAIOpenInTab}
      />

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={isAISettingsOpen}
        onClose={closeAISettings}
        currentConfig={aiConfig}
        onSave={async (config) => {
          // Save to local store
          setAIConfig(config)
          // Save to main process
          await window.api.ai.setConfig(config)
        }}
        onClear={async () => {
          setAIConfig(null)
          await window.api.ai.clearConfig()
        }}
      />
    </>
  )
}

// Root Layout wrapper that provides context
function RootLayout() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="data-peek-theme">
      <SidebarProvider>
        <LayoutContent />
      </SidebarProvider>
    </ThemeProvider>
  )
}

// Theme Option Component
function ThemeOption({
  value,
  label,
  icon: Icon,
  currentTheme,
  onSelect
}: {
  value: 'light' | 'dark' | 'system'
  label: string
  icon: typeof Sun
  currentTheme: string
  onSelect: (theme: 'light' | 'dark' | 'system') => void
}) {
  const isSelected = currentTheme === value

  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border/50 hover:border-border hover:bg-muted/50'
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-6" />
      </div>
      <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>{label}</span>
    </button>
  )
}

// Keyboard shortcut display component
function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
            <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border/50 rounded shadow-sm">
              {key}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  )
}

// Settings Page
function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const licenseStatus = useLicenseStore((s) => s.status)
  const openSettingsModal = useLicenseStore((s) => s.openSettingsModal)
  const openActivationModal = useLicenseStore((s) => s.openActivationModal)

  // App settings
  const {
    hideQueryEditorByDefault,
    expandJsonByDefault,
    setHideQueryEditorByDefault,
    setExpandJsonByDefault,
    hideQuickQueryPanel,
    setHideQuickQueryPanel
  } = useSettingsStore()

  return (
    <div className="flex flex-1 flex-col p-6 overflow-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>
      <div className="space-y-6 max-w-2xl">
        {/* License */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">License</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your data-peek license for commercial use.
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {licenseStatus?.type === 'personal' ? (
                <>
                  <span className="size-2 rounded-full bg-muted-foreground" />
                  <span className="text-sm">Personal Use (Free)</span>
                </>
              ) : (
                <>
                  <span
                    className={`size-2 rounded-full ${
                      licenseStatus?.daysUntilExpiry && licenseStatus.daysUntilExpiry <= 0
                        ? 'bg-amber-500'
                        : 'bg-green-500'
                    }`}
                  />
                  <span className="text-sm capitalize">
                    {licenseStatus?.type} License
                    {licenseStatus?.email && ` (${licenseStatus.email})`}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={() =>
                licenseStatus?.type === 'personal' ? openActivationModal() : openSettingsModal()
              }
              className="text-sm text-primary hover:underline"
            >
              {licenseStatus?.type === 'personal' ? 'Activate License' : 'Manage License'}
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">Appearance</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose your preferred theme for the application.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <ThemeOption
              value="light"
              label="Light"
              icon={Sun}
              currentTheme={theme}
              onSelect={setTheme}
            />
            <ThemeOption
              value="dark"
              label="Dark"
              icon={Moon}
              currentTheme={theme}
              onSelect={setTheme}
            />
            <ThemeOption
              value="system"
              label="System"
              icon={Monitor}
              currentTheme={theme}
              onSelect={setTheme}
            />
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">Keyboard Shortcuts</h2>
          <p className="text-sm text-muted-foreground mb-4">
            All available keyboard shortcuts in the application.
          </p>

          <div className="space-y-4">
            {/* Tab Management */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Tab Management</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'T']} description="Create new query tab" />
                <ShortcutRow keys={[keys.mod, 'W']} description="Close current tab" />
                <ShortcutRow keys={[keys.mod, '1-9']} description="Switch to tab by number" />
                <ShortcutRow keys={[keys.mod, keys.alt, '→']} description="Switch to next tab" />
                <ShortcutRow
                  keys={[keys.mod, keys.alt, '←']}
                  description="Switch to previous tab"
                />
              </div>
            </div>

            {/* Connections */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Connections</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'P']} description="Open connection picker" />
                <ShortcutRow
                  keys={[keys.mod, keys.shift, '1-9']}
                  description="Switch to connection by number"
                />
              </div>
            </div>

            {/* Sidebar */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Sidebar</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'B']} description="Toggle sidebar visibility" />
              </div>
            </div>

            {/* Query Editor */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Query Editor</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'Enter']} description="Execute/run current query" />
                <ShortcutRow keys={[keys.mod, keys.shift, 'F']} description="Format SQL query" />
              </div>
            </div>

            {/* Foreign Keys */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Foreign Keys</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'Click']} description="Open foreign key in new tab" />
                <ShortcutRow keys={['Click']} description="Open foreign key in side panel" />
              </div>
            </div>

            {/* AI Assistant */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">AI Assistant</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'I']} description="Toggle AI assistant panel" />
              </div>
            </div>

            {/* General */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">General</h3>
              <div className="space-y-1">
                <ShortcutRow keys={[keys.mod, 'K']} description="Open command palette" />
              </div>
            </div>
          </div>
        </div>

        {/* Connections */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">Connections</h2>
          <p className="text-sm text-muted-foreground">
            Manage your database connections and credentials.
          </p>
        </div>

        {/* Editor */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">Query Editor</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Customize the query editor appearance and behavior.
          </p>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hide-editor">Hide query editor by default</Label>
              <p className="text-xs text-muted-foreground">
                Start with the query editor collapsed when opening table previews
              </p>
            </div>
            <Switch
              id="hide-editor"
              checked={hideQueryEditorByDefault}
              onCheckedChange={setHideQueryEditorByDefault}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hide-quick-query-panel">Hide quick query panel by default</Label>
              <p className="text-xs text-muted-foreground">Hide the quick query panel by default</p>
            </div>
            <Switch
              id="hide-quick-query-panel"
              checked={hideQuickQueryPanel}
              onCheckedChange={setHideQuickQueryPanel}
            />
          </div>
        </div>

        {/* JSON Display */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h2 className="text-lg font-medium mb-2">JSON Display</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure how JSON data is displayed in results.
          </p>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="expand-json">Expand JSON by default</Label>
              <p className="text-xs text-muted-foreground">
                Automatically expand all JSON objects when viewing
              </p>
            </div>
            <Switch
              id="expand-json"
              checked={expandJsonByDefault}
              onCheckedChange={setExpandJsonByDefault}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Create routes
const rootRoute = createRootRoute({
  component: RootLayout
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TabContainer
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage
})

// Create route tree
const routeTree = rootRoute.addChildren([indexRoute, settingsRoute])

// Create memory history for Electron (file:// protocol doesn't work with browser history)
const memoryHistory = createMemoryHistory({
  initialEntries: ['/']
})

// Create router
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  history: memoryHistory
})

// Type declaration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
