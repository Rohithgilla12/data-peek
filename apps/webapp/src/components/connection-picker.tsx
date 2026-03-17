import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, Loader2, FolderOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useConnectionStore } from '@/stores'
import { cn } from '@/lib/utils'
import { AddConnectionDialog } from './add-connection-dialog'
import { DatabaseIcon } from './database-icons'

interface ConnectionPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionPicker({ open, onOpenChange }: ConnectionPickerProps) {
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)

  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter connections based on search
  const filteredConnections = connections.filter((conn) => {
    const query = search.toLowerCase()
    return (
      conn.name.toLowerCase().includes(query) ||
      conn.host.toLowerCase().includes(query) ||
      conn.database.toLowerCase().includes(query) ||
      (conn.group?.toLowerCase().includes(query) ?? false)
    )
  })

  // Group connections by folder/group
  const groupedConnections = filteredConnections.reduce(
    (acc, conn) => {
      const group = conn.group || 'Ungrouped'
      if (!acc[group]) acc[group] = []
      acc[group].push(conn)
      return acc
    },
    {} as Record<string, typeof connections>
  )

  const groups = Object.keys(groupedConnections).sort((a, b) => {
    if (a === 'Ungrouped') return 1
    if (b === 'Ungrouped') return -1
    return a.localeCompare(b)
  })

  // Flatten for keyboard navigation
  const flatList = groups.flatMap((group) => groupedConnections[group])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const handleSelectConnection = useCallback(
    async (connectionId: string) => {
      setConnectionStatus(connectionId, { isConnecting: true, error: undefined })
      setTimeout(() => {
        setConnectionStatus(connectionId, { isConnecting: false, isConnected: true })
        setActiveConnection(connectionId)
      }, 500)
      onOpenChange(false)
    },
    [setConnectionStatus, setActiveConnection, onOpenChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatList[selectedIndex]) {
            handleSelectConnection(flatList[selectedIndex].id)
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    },
    [flatList, selectedIndex, handleSelectConnection, onOpenChange]
  )

  // Handle Cmd+1-9 within the picker
  useEffect(() => {
    if (!open) return

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (connections[index]) {
          handleSelectConnection(connections[index].id)
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, connections, handleSelectConnection])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 gap-0 max-w-md" onKeyDown={handleKeyDown}>
          <DialogHeader className="px-3 pt-3 pb-0">
            <DialogTitle className="sr-only">Switch Connection</DialogTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search connections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 border-0 focus-visible:ring-0 bg-transparent"
              />
            </div>
          </DialogHeader>

          <div className="border-t">
            <div className="max-h-[300px] overflow-y-auto py-2">
              {filteredConnections.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No connections found
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group}>
                    {groups.length > 1 && (
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <FolderOpen className="size-3" />
                        {group}
                      </div>
                    )}
                    {groupedConnections[group].map((connection) => {
                      const globalIndex = flatList.findIndex((c) => c.id === connection.id)
                      const isSelected = globalIndex === selectedIndex
                      const isActive = connection.id === activeConnectionId
                      const shortcutIndex = connections.findIndex((c) => c.id === connection.id)

                      return (
                        <button
                          key={connection.id}
                          onClick={() => handleSelectConnection(connection.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                            isSelected && 'bg-accent',
                            !isSelected && 'hover:bg-accent/50'
                          )}
                        >
                          <div className="relative flex size-8 items-center justify-center rounded-md border bg-background">
                            {connection.isConnecting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <DatabaseIcon dbType={connection.dbType} className="size-4" />
                            )}
                            {connection.isConnected && !connection.isConnecting && (
                              <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-500 ring-2 ring-background" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{connection.name}</span>
                              {isActive && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  Active
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate block">
                              {connection.host}:{connection.port}/{connection.database}
                            </span>
                          </div>
                          {shortcutIndex < 9 && (
                            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                              <span className="text-xs">⌘⇧</span>
                              {shortcutIndex + 1}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-2">
              <button
                onClick={() => {
                  onOpenChange(false)
                  setIsAddDialogOpen(true)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="flex size-8 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <span className="text-sm text-muted-foreground">Add new connection</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddConnectionDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
    </>
  )
}
