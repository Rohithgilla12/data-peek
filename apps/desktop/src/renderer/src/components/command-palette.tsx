'use client'

import * as React from 'react'
import {
  Command,
  Search,
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
  Trash2,
  RefreshCw,
  Terminal,
  Keyboard,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Command types
export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: string[]
  category: string
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: CommandItem[]
}

// Category icons and colors
const categoryConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  AI: { icon: <Sparkles className="size-3.5" />, color: 'text-blue-400' },
  Connections: { icon: <Database className="size-3.5" />, color: 'text-emerald-400' },
  Queries: { icon: <FileCode2 className="size-3.5" />, color: 'text-amber-400' },
  Navigation: { icon: <LayoutGrid className="size-3.5" />, color: 'text-purple-400' },
  Appearance: { icon: <Moon className="size-3.5" />, color: 'text-pink-400' },
  General: { icon: <Command className="size-3.5" />, color: 'text-zinc-400' }
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = React.useState('')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Filter commands based on search
  const filteredCommands = React.useMemo(() => {
    if (!search.trim()) return commands

    const searchLower = search.toLowerCase()
    return commands.filter((cmd) => {
      const matchLabel = cmd.label.toLowerCase().includes(searchLower)
      const matchDescription = cmd.description?.toLowerCase().includes(searchLower)
      const matchKeywords = cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower))
      const matchCategory = cmd.category.toLowerCase().includes(searchLower)
      return matchLabel || matchDescription || matchKeywords || matchCategory
    })
  }, [commands, search])

  // Group commands by category
  const groupedCommands = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  // Flatten for keyboard navigation
  const flatCommands = React.useMemo(() => {
    return Object.values(groupedCommands).flat()
  }, [groupedCommands])

  // Reset selection when search changes
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Scroll selected item into view
  React.useEffect(() => {
    if (listRef.current && flatCommands.length > 0) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      selectedEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, flatCommands.length])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, flatCommands.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatCommands[selectedIndex]) {
          flatCommands[selectedIndex].action()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  if (!isOpen) return null

  let globalIndex = 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
      />

      {/* Palette */}
      <div
        className={cn(
          'fixed left-1/2 top-[20%] z-[101] -translate-x-1/2',
          'w-full max-w-[560px]',
          'animate-in fade-in-0 slide-in-from-top-4 duration-200'
        )}
      >
        <div
          className={cn(
            'overflow-hidden rounded-2xl',
            'bg-zinc-900/95 backdrop-blur-xl',
            'border border-zinc-700/50',
            'shadow-2xl shadow-black/50',
            'ring-1 ring-white/5'
          )}
        >
          {/* Search input */}
          <div className="relative flex items-center border-b border-zinc-800/80">
            <Search className="absolute left-4 size-4 text-zinc-500" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              className={cn(
                'w-full bg-transparent py-4 pl-11 pr-4',
                'text-sm text-zinc-100 placeholder:text-zinc-500',
                'focus:outline-none'
              )}
            />
            <div className="absolute right-4 flex items-center gap-2">
              <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400">
                ESC
              </kbd>
            </div>
          </div>

          {/* Commands list */}
          <div ref={listRef} className="max-h-[400px] overflow-y-auto p-2">
            {flatCommands.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="size-8 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500">No commands found</p>
                <p className="text-xs text-zinc-600 mt-1">Try a different search term</p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category} className="mb-2 last:mb-0">
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span
                      className={cn(
                        'opacity-60',
                        categoryConfig[category]?.color || 'text-zinc-400'
                      )}
                    >
                      {categoryConfig[category]?.icon}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      {category}
                    </span>
                  </div>

                  {/* Commands */}
                  {items.map((cmd) => {
                    const currentIndex = globalIndex++
                    const isSelected = currentIndex === selectedIndex

                    return (
                      <button
                        key={cmd.id}
                        data-index={currentIndex}
                        onClick={() => {
                          cmd.action()
                          onClose()
                        }}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                          'text-left transition-all duration-75',
                          isSelected
                            ? 'bg-zinc-800/80 ring-1 ring-zinc-700/50'
                            : 'hover:bg-zinc-800/50'
                        )}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'flex items-center justify-center size-8 rounded-lg',
                            'bg-zinc-800 border border-zinc-700/50',
                            isSelected && 'bg-zinc-700 border-zinc-600'
                          )}
                        >
                          {cmd.icon || <Command className="size-4 text-zinc-400" />}
                        </div>

                        {/* Label & description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{cmd.label}</p>
                          {cmd.description && (
                            <p className="text-xs text-zinc-500 truncate">{cmd.description}</p>
                          )}
                        </div>

                        {/* Shortcut */}
                        {cmd.shortcut && (
                          <div className="flex items-center gap-1">
                            {cmd.shortcut.map((key, i) => (
                              <kbd
                                key={i}
                                className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}

                        {/* Arrow indicator */}
                        {isSelected && (
                          <ChevronRight className="size-4 text-zinc-500 animate-in slide-in-from-left-1 duration-150" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700">↑</kbd>
                <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">↵</kbd>
                to select
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Command className="size-3 text-zinc-600" />
              <span className="text-[10px] text-zinc-600">data-peek</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Export icons for use in command definitions
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
  Trash2,
  RefreshCw,
  Terminal,
  Keyboard,
  LogOut
}
