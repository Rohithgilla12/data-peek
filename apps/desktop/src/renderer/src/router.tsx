import {
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  Outlet,
  useRouter,
  useNavigate,
  type ErrorComponentProps
} from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo, Component, type ReactNode } from 'react'
import { AiIcon, CaretUpDownIcon, CommandIcon, WarningIcon } from '@/components/icons'
import { useAutoUpdater } from '@/hooks/use-auto-updater'
import { usePokemonTracker } from '@/hooks/use-pokemon-tracker'
import { ThemeProvider } from '@/components/theme-provider'
import { CommandPalette } from '@/components/command-palette'
import { McpApprovalDialog } from '@/components/mcp-approval-dialog'
import { SavedQueriesDialog } from '@/components/saved-queries-dialog'
import { DatabaseIcon } from '@/components/database-icons'
import { AppSidebar } from '@/components/app-sidebar'
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  cn,
  keys,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@data-peek/ui'
import { TabContainer } from '@/components/tab-container'
import { DashboardView } from '@/components/dashboard'
import { ConnectionPicker } from '@/components/connection-picker'
import { AddConnectionDialog } from '@/components/add-connection-dialog'
import { LicenseStatusIndicator } from '@/components/license-status-indicator'
import { LicenseActivationModal } from '@/components/license-activation-modal'
import { LicenseSettingsModal } from '@/components/license-settings-modal'
import { AIChatPanel } from '@/components/ai'
import { SettingsPage } from '@/components/settings/settings-page'
import { parseSettingsSection, type SettingsSection } from '@/components/settings/sections'
import { useOpenSettings } from '@/hooks/use-open-settings'
import { ProviderPill } from '@/components/ask/ask-composer'
import { useTabShortcuts } from '@/hooks/use-tab-shortcuts'
import { Notifications } from '@/components/notifications'
import { PokemonBuddy } from '@/components/pokemon-buddy'
import { useAIStore } from '@/stores/ai-store'
import { useConnectionStore, useLicenseStore, useSettingsStore, useTabStore } from '@/stores'
import { TitlebarActions } from '@/components/titlebar-actions'
import { useHotkeys, type UseHotkeyDefinition, type Hotkey } from '@tanstack/react-hotkeys'

// Command palette page type for direct navigation
type CommandPalettePage = 'home' | 'connections' | 'connections:switch' | 'saved-queries'

// Last tab focus request the shell acted on. Module-level so a request made while the layout
// was unmounted (e.g. behind the error boundary) is still honoured when it remounts.
let handledFocusRequest = 0

// Inner layout component that has access to sidebar context
function LayoutContent() {
  const { state: sidebarState } = useSidebar()
  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const connections = useConnectionStore((s) => s.connections)
  const selectConnection = useConnectionStore((s) => s.selectConnection)
  const [isConnectionPickerOpen, setIsConnectionPickerOpen] = useState(false)

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [commandPaletteInitialPage, setCommandPaletteInitialPage] =
    useState<CommandPalettePage>('home')

  // Saved queries dialog state
  const [isSavedQueriesOpen, setIsSavedQueriesOpen] = useState(false)

  // Add connection dialog state (for command palette integration)
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false)
  const [editConnectionId, setEditConnectionId] = useState<string | null>(null)

  // License modal states from store
  const isActivationModalOpen = useLicenseStore((s) => s.isActivationModalOpen)
  const closeActivationModal = useLicenseStore((s) => s.closeActivationModal)
  const isSettingsModalOpen = useLicenseStore((s) => s.isSettingsModalOpen)
  const closeSettingsModal = useLicenseStore((s) => s.closeSettingsModal)

  // AI states from store
  const isAIPanelOpen = useAIStore((s) => s.isPanelOpen)
  const toggleAIPanel = useAIStore((s) => s.togglePanel)
  const closeAIPanel = useAIStore((s) => s.closePanel)
  const openSettings = useOpenSettings()
  const isAIConfigured = useAIStore((s) => s.isConfigured)
  const loadConfigFromMain = useAIStore((s) => s.loadConfigFromMain)

  // Get schemas for AI context
  const schemas = useConnectionStore((s) => s.schemas)

  // Tab store for opening SQL in new tab
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const createAskTab = useTabStore((s) => s.createAskTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const syncActiveTabWithConnection = useTabStore((s) => s.syncActiveTabWithConnection)

  // Track active connection ID for sync effect
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const platform = window.electron.process.platform

  // Handle opening SQL in a new tab (without execution)
  const handleAIOpenInTab = useCallback(
    (sql: string) => {
      const tabId = createQueryTab(activeConnection?.id || null, sql)
      setActiveTab(tabId)
    },
    [activeConnection, createQueryTab, setActiveTab]
  )

  // Load AI config from main process on mount
  useEffect(() => {
    loadConfigFromMain()
  }, [loadConfigFromMain])

  const router = useRouter()
  const navigate = useNavigate()

  // Settings menu item / Mod+, opens the settings page
  useEffect(() => window.api.menu.onOpenSettings(() => openSettings()), [openSettings])

  useTabShortcuts()

  // Tabs only render on the index route. When something opens or focuses a tab while another
  // page (settings, a dashboard) is showing, bring the workspace back into view.
  const focusRequest = useTabStore((s) => s.focusRequest)
  useEffect(() => {
    if (focusRequest === handledFocusRequest) return
    handledFocusRequest = focusRequest
    if (router.state.location.pathname !== '/') navigate({ to: '/' })
  }, [focusRequest, navigate, router])

  // Sync active query tab's connection when the active connection changes
  useEffect(() => {
    if (activeConnectionId) {
      syncActiveTabWithConnection(activeConnectionId)
    }
  }, [activeConnectionId, syncActiveTabWithConnection])

  // Handle connection switching (used by keyboard shortcuts)
  const handleSelectConnection = useCallback(
    (connectionId: string) => {
      selectConnection(connectionId)
    },
    [selectConnection]
  )

  // Open command palette with specific page
  const openCommandPalette = useCallback((page: CommandPalettePage = 'home') => {
    setCommandPaletteInitialPage(page)
    setIsCommandPaletteOpen(true)
  }, [])

  // Global keyboard shortcuts
  const globalHotkeys = useMemo<UseHotkeyDefinition[]>(
    () => [
      { hotkey: 'Mod+K', callback: () => openCommandPalette('home') },
      { hotkey: 'Mod+P', callback: () => openCommandPalette('connections:switch') },
      { hotkey: 'Mod+I', callback: () => toggleAIPanel() },
      ...Array.from({ length: 9 }, (_, i) => ({
        hotkey: `Mod+Shift+${i + 1}` as Hotkey,
        callback: () => {
          if (connections[i]) handleSelectConnection(connections[i].id)
        }
      }))
    ],
    [connections, handleSelectConnection, openCommandPalette, toggleAIPanel]
  )
  useHotkeys(globalHotkeys)

  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header
          className={cn(
            'titlebar-drag-region flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background/80 backdrop-blur-xl transition-[margin] duration-200 ease-linear',
            sidebarState === 'collapsed' && platform === 'darwin' && 'ml-[72px]'
          )}
        >
          <div className="flex flex-1 items-center gap-2 px-3">
            <SidebarTrigger className="titlebar-no-drag" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openCommandPalette('connections:switch')}
                  className="titlebar-no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/60"
                >
                  {activeConnection ? (
                    <>
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          activeConnection.isConnected ? 'bg-success' : 'bg-warning'
                        )}
                      />
                      <DatabaseIcon dbType={activeConnection.dbType} className="size-4" />
                      <span className="text-foreground">{activeConnection.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Pick a database</span>
                  )}
                  <CaretUpDownIcon className="size-3 text-muted-foreground/60" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Switch database ({keys.mod}+P)</TooltipContent>
            </Tooltip>
          </div>
          <div className="titlebar-no-drag ml-auto flex items-center gap-2 px-3">
            <ProviderPill />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-primary hover:text-primary"
              onClick={() => createAskTab(activeConnection?.id ?? null)}
            >
              <AiIcon className="size-4" />
              Ask
              <kbd className="rounded border border-border/60 px-1 font-mono text-2xs text-muted-foreground">
                {keys.mod}T
              </kbd>
            </Button>
            {/* Command Palette Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCommandPaletteOpen(true)}
                >
                  <CommandIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Command Palette ({keys.mod}+K)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            <LicenseStatusIndicator />
          </div>
          {platform === 'win32' && (
            <>
              <Separator orientation="vertical" className="data-[orientation=vertical]:h-4 -ml-3" />
              <TitlebarActions />
            </>
          )}
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        initialPage={commandPaletteInitialPage}
        onOpenAddConnection={() => setIsAddConnectionOpen(true)}
        onOpenEditConnection={(id) => setEditConnectionId(id)}
      />

      <McpApprovalDialog />

      {/* Global Connection Picker */}
      <ConnectionPicker open={isConnectionPickerOpen} onOpenChange={setIsConnectionPickerOpen} />

      {/* Saved Queries Dialog */}
      <SavedQueriesDialog open={isSavedQueriesOpen} onOpenChange={setIsSavedQueriesOpen} />

      {/* Add/Edit Connection Dialog (triggered from command palette) */}
      <AddConnectionDialog
        open={isAddConnectionOpen || editConnectionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddConnectionOpen(false)
            setEditConnectionId(null)
          }
        }}
        connection={editConnectionId ? connections.find((c) => c.id === editConnectionId) : null}
      />

      {/* License Modals */}
      <LicenseActivationModal open={isActivationModalOpen} onOpenChange={closeActivationModal} />
      <LicenseSettingsModal open={isSettingsModalOpen} onOpenChange={closeSettingsModal} />

      {/* AI Assistant Panel */}
      <AIChatPanel
        isOpen={isAIPanelOpen}
        onClose={closeAIPanel}
        onOpenSettings={() => {
          closeAIPanel()
          openSettings('ai')
        }}
        connection={activeConnection || null}
        schemas={schemas}
        isConfigured={isAIConfigured}
        onOpenInTab={handleAIOpenInTab}
      />
    </>
  )
}

// Root Layout wrapper that provides context
function RootLayout() {
  // Initialize auto-updater notifications
  useAutoUpdater()

  const pokemonBuddyEnabled = useSettingsStore((s) => s.pokemonBuddyEnabled)

  // Track queries for Pokemon buddy analytics
  usePokemonTracker()

  return (
    <ThemeProvider defaultTheme="dark" storageKey="data-peek-theme">
      <SidebarProvider>
        <LayoutContent />
        <Notifications />
        {pokemonBuddyEnabled && <PokemonBuddy />}
      </SidebarProvider>
    </ThemeProvider>
  )
}

function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <WarningIcon className="size-10 text-warning" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 max-w-full overflow-auto whitespace-pre-wrap">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            Try Again
          </Button>
          <Button
            size="sm"
            onClick={() => {
              reset()
              router.navigate({ to: '/' })
            }}
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}

export class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground p-8">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <WarningIcon className="size-10 text-warning" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 max-w-full overflow-auto whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                }}
              >
                Try Again
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
              >
                Reload App
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Create routes
const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RouteErrorComponent
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TabContainer,
  errorComponent: RouteErrorComponent
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (search: Record<string, unknown>): { section?: SettingsSection } => ({
    section: parseSettingsSection(search.section)
  }),
  component: SettingsPage,
  errorComponent: RouteErrorComponent
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/$dashboardId',
  component: DashboardView,
  errorComponent: RouteErrorComponent
})

// Create route tree
const routeTree = rootRoute.addChildren([indexRoute, settingsRoute, dashboardRoute])

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
