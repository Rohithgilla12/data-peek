import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Settings, Loader2, Pencil, Trash2, Copy } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useConnectionStore, type Connection } from '@/stores'
import { useNavigate } from '@tanstack/react-router'
import { AddConnectionDialog } from './add-connection-dialog'
import { DatabaseIcon } from './database-icons'

export function ConnectionSwitcher() {
  const navigate = useNavigate()
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const initializeConnections = useConnectionStore((s) => s.initializeConnections)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const addConnection = useConnectionStore((s) => s.addConnection)
  const isInitialized = useConnectionStore((s) => s.isInitialized)
  const setupConnectionSync = useConnectionStore((s) => s.setupConnectionSync)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null)

  // Initialize connections from persistent storage on mount
  useEffect(() => {
    initializeConnections()
  }, [initializeConnections])

  // Set up listener for connection updates from other windows
  useEffect(() => {
    const cleanup = setupConnectionSync()
    return cleanup
  }, [setupConnectionSync])

  const activeConnection = connections.find((c) => c.id === activeConnectionId)

  const handleSelectConnection = async (connectionId: string) => {
    // Set connecting status
    setConnectionStatus(connectionId, { isConnecting: true, error: undefined })

    // Simulate connection (in real app, this would be IPC call)
    setTimeout(() => {
      setConnectionStatus(connectionId, { isConnecting: false, isConnected: true })
      setActiveConnection(connectionId)
    }, 500)
  }

  const handleManageConnections = () => {
    navigate({ to: '/settings' })
  }

  const handleEditConnection = (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation()
    setEditingConnection(connection)
  }

  const handleDeleteConnection = (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation()
    setDeletingConnection(connection)
  }

  const handleDuplicateConnection = async (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation()
    try {
      const duplicatedConnection = {
        ...connection,
        id: crypto.randomUUID(),
        name: `${connection.name} (copy)`,
        isConnected: false,
        isConnecting: false
      }

      const result = await window.api.connections.add(duplicatedConnection)
      if (result.success && result.data) {
        addConnection(result.data)
      } else {
        console.error('Failed to duplicate connection:', result.error)
      }
    } catch (error) {
      console.error('Error duplicating connection:', error)
    }
  }

  const confirmDelete = async () => {
    if (deletingConnection) {
      await removeConnection(deletingConnection.id)
      setDeletingConnection(null)
    }
  }

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="w-fit px-1.5">
            <div className="flex aspect-square size-5 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
            <span className="truncate font-medium text-muted-foreground">Loading...</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (connections.length === 0) {
    return (
      <>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="w-fit px-1.5" onClick={() => setIsAddDialogOpen(true)}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-5 items-center justify-center rounded-md">
                <Plus className="size-3" />
              </div>
              <span className="truncate font-medium">Add connection</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <AddConnectionDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
      </>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-fit px-1.5">
              <div className="relative flex aspect-square size-5 items-center justify-center">
                <DatabaseIcon
                  dbType={activeConnection?.dbType}
                  className="size-4 text-sidebar-primary"
                />
                {activeConnection?.isConnected && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-500 ring-1 ring-sidebar" />
                )}
                {activeConnection?.isConnecting && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-yellow-500 ring-1 ring-sidebar animate-pulse" />
                )}
              </div>
              <span className="truncate font-medium">
                {activeConnection?.name || 'Select connection'}
              </span>
              <ChevronDown className="opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-96 max-w-[90vw] rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Connections
            </DropdownMenuLabel>
            {connections.map((connection, index) => (
              <DropdownMenuItem
                key={connection.id}
                onClick={() => handleSelectConnection(connection.id)}
                className="gap-2 p-2 group"
                disabled={connection.isConnecting}
              >
                <div className="relative flex size-6 shrink-0 items-center justify-center rounded-xs border">
                  {connection.isConnecting ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <DatabaseIcon dbType={connection.dbType} className="size-4 shrink-0" />
                  )}
                  {connection.isConnected && !connection.isConnecting && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-500 ring-1 ring-background" />
                  )}
                </div>
                <div className="flex flex-1 min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate">{connection.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {connection.host}:{connection.port}/{connection.database}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDuplicateConnection(e, connection)}
                    className="p-1 hover:bg-muted rounded"
                    title="Duplicate connection"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleEditConnection(e, connection)}
                    className="p-1 hover:bg-muted rounded"
                    title="Edit connection"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteConnection(e, connection)}
                    className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                    title="Delete connection"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {index < 9 && (
                  <DropdownMenuShortcut className="shrink-0">⌘⇧{index + 1}</DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onClick={() => setIsAddDialogOpen(true)}>
              <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">Add connection</div>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 p-2" onClick={handleManageConnections}>
              <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                <Settings className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">Manage connections</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {/* Add/Edit Connection Dialog */}
      <AddConnectionDialog
        open={isAddDialogOpen || !!editingConnection}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false)
            setEditingConnection(null)
          }
        }}
        connection={editingConnection}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingConnection} onOpenChange={() => setDeletingConnection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingConnection?.name}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenu>
  )
}
