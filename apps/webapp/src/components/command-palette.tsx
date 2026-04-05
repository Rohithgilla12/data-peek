'use client'

import { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import {
  Database,
  Play,
  Plus,
  Wand2,
  Settings,
  Activity,
  LayoutDashboard,
  Search,
} from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { data: connections } = trpc.connections.list.useQuery()
  const { activeConnectionId, setActiveConnection } = useConnectionStore()
  const { addTab } = useQueryStore()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const runAction = useCallback(
    (fn: () => void) => {
      fn()
      setOpen(false)
    },
    []
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
          loop
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Command.Input
              placeholder="Type a command or search..."
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
            <kbd className="text-[10px] text-muted-foreground/50 bg-muted rounded px-1.5 py-0.5 font-mono shrink-0">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Actions" className="text-xs text-muted-foreground/70 px-2 pb-1">
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => window.dispatchEvent(new Event('datapeek:execute')))}
              >
                <Play className="size-4" />
                Run Query
                <kbd className="ml-auto text-[10px] opacity-50 font-mono">⌘↵</kbd>
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() =>
                  runAction(() => window.dispatchEvent(new Event('datapeek:format')))
                }
              >
                <Wand2 className="size-4" />
                Format SQL
                <kbd className="ml-auto text-[10px] opacity-50 font-mono">⌘⇧F</kbd>
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => addTab())}
              >
                <Plus className="size-4" />
                New Tab
                <kbd className="ml-auto text-[10px] opacity-50 font-mono">⌘T</kbd>
              </Command.Item>
            </Command.Group>

            <Command.Separator className="h-px bg-border my-1" />

            <Command.Group heading="Navigate" className="text-xs text-muted-foreground/70 px-2 pb-1">
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => router.push('/'))}
              >
                <Database className="size-4" />
                Query Editor
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => router.push('/connections'))}
              >
                <Database className="size-4" />
                Connections
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => router.push('/health'))}
              >
                <Activity className="size-4" />
                Health Monitor
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                onSelect={() => runAction(() => router.push('/settings'))}
              >
                <Settings className="size-4" />
                Settings
              </Command.Item>
            </Command.Group>

            {connections && connections.length > 0 && (
              <>
                <Command.Separator className="h-px bg-border my-1" />
                <Command.Group
                  heading="Switch Connection"
                  className="text-xs text-muted-foreground/70 px-2 pb-1"
                >
                  {connections.map((conn) => (
                    <Command.Item
                      key={conn.id}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-muted-foreground"
                      onSelect={() => runAction(() => setActiveConnection(conn.id))}
                    >
                      <div
                        className={`size-2 rounded-full ${
                          conn.id === activeConnectionId ? 'bg-success' : 'bg-muted-foreground/30'
                        }`}
                      />
                      {conn.name}
                      <span className="ml-auto text-[10px] opacity-40">{conn.dbType}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
