import * as React from 'react'
import { ArrowDownUp, ArrowRight, Check, Loader2, X } from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import { getTypeColor } from '@/lib/type-colors'
import { SortChipItem } from '@/components/sort/sort-chip'
import type { SortScope } from '@/lib/sort-scope'
import {
  defaultDirectionForType,
  makeChip,
  modesForType,
  newSeed,
  PRESETS,
  type NullsPosition,
  type PresetDef,
  type SortChip,
  type SortColumn,
  type SortMode
} from '@/lib/sort-model'

function SortStatus({
  scope,
  isSortingOnServer,
  onSortWholeSet
}: {
  scope: SortScope
  isSortingOnServer?: boolean
  onSortWholeSet?: () => void
}) {
  if (isSortingOnServer) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        sorting…
      </span>
    )
  }

  if (scope.kind === 'server') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Check className="size-3 text-primary/70" />
        sorted on server
      </span>
    )
  }

  if (scope.kind === 'complete') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Check className="size-3 text-primary/70" />
        sorted {scope.rows.toLocaleString()} rows
      </span>
    )
  }

  const total = scope.total
  return (
    <span className="flex items-center gap-2">
      <span className="text-[10px] text-amber-500/90">
        {total === null
          ? `sorting ${scope.loaded.toLocaleString()} loaded rows`
          : `sorting ${scope.loaded.toLocaleString()} of ${total.toLocaleString()} loaded`}
      </span>
      {onSortWholeSet && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-primary/90 hover:text-primary gap-1"
          onClick={onSortWholeSet}
          title="Rewrite ORDER BY and re-run so the sort covers every row"
        >
          {total === null ? 'Sort all rows' : `Sort all ${total.toLocaleString()}`}
          <ArrowRight className="size-3" />
        </Button>
      )}
    </span>
  )
}

interface SmartSortBarProps {
  columns: SortColumn[]
  chips: SortChip[]
  onChipsChange: (chips: SortChip[]) => void
  scope: SortScope
  /** True while a server-side sort re-run is debouncing or in flight. */
  isSortingOnServer?: boolean
  /** Rewrite ORDER BY and re-run so the sort covers rows not yet loaded. */
  onSortWholeSet?: () => void
  className?: string
}

export function SmartSortBar({
  columns,
  chips,
  onChipsChange,
  scope,
  isSortingOnServer,
  onSortWholeSet,
  className
}: SmartSortBarProps) {
  const [isPicking, setIsPicking] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlighted, setHighlighted] = React.useState(0)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  const columnByName = React.useMemo(() => {
    const m = new Map<string, SortColumn>()
    for (const c of columns) m.set(c.name, c)
    return m
  }, [columns])

  const availableColumns = React.useMemo(() => {
    const used = new Set(chips.map((c) => c.column))
    return columns.filter((c) => !used.has(c.name))
  }, [columns, chips])

  const filteredColumns = React.useMemo(() => {
    if (!query.trim()) return availableColumns
    const q = query.toLowerCase()
    return availableColumns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dataType.toLowerCase().includes(q)
    )
  }, [availableColumns, query])

  const availablePresets = React.useMemo(() => {
    return PRESETS.filter((p) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    })
  }, [query])

  React.useEffect(() => {
    setHighlighted(0)
  }, [filteredColumns.length, availablePresets.length, query])

  const startPicking = React.useCallback(() => {
    setIsPicking(true)
    setQuery('')
  }, [])

  React.useEffect(() => {
    if (isPicking) inputRef.current?.focus()
  }, [isPicking])

  const cancelPicking = React.useCallback(() => {
    setIsPicking(false)
    setQuery('')
  }, [])

  const addChip = React.useCallback(
    (col: SortColumn) => {
      const chip = makeChip(col, defaultDirectionForType(col.dataType))
      onChipsChange([...chips, chip])
      cancelPicking()
    },
    [chips, onChipsChange, cancelPicking]
  )

  const applyPreset = React.useCallback(
    (preset: PresetDef) => {
      const next = preset.build(columns)
      if (next && next.length > 0) {
        onChipsChange(next)
      }
      cancelPicking()
    },
    [columns, onChipsChange, cancelPicking]
  )

  const removeChip = React.useCallback(
    (id: string) => {
      onChipsChange(chips.filter((c) => c.id !== id))
    },
    [chips, onChipsChange]
  )

  const transformChip = React.useCallback(
    (id: string, transform: (chip: SortChip) => SortChip) => {
      onChipsChange(chips.map((c) => (c.id === id ? transform(c) : c)))
    },
    [chips, onChipsChange]
  )

  const toggleDirection = React.useCallback(
    (id: string) => {
      transformChip(id, (c) => ({ ...c, direction: c.direction === 'asc' ? 'desc' : 'asc' }))
    },
    [transformChip]
  )

  const cycleMode = React.useCallback(
    (id: string) => {
      transformChip(id, (c) => {
        const col = columnByName.get(c.column)
        if (!col) return c
        const modes = modesForType(col.dataType)
        const idx = modes.findIndex((m) => m.value === c.mode)
        const next = modes[(idx + 1) % modes.length]
        const base = {
          id: c.id,
          column: c.column,
          direction: c.direction,
          nullsPosition: c.nullsPosition
        }
        if (next.value === 'random') {
          return { ...base, mode: 'random', seed: c.mode === 'random' ? c.seed : newSeed() }
        }
        return { ...base, mode: next.value }
      })
    },
    [columnByName, transformChip]
  )

  const setMode = React.useCallback(
    (id: string, mode: SortMode) => {
      transformChip(id, (c) => {
        const base = {
          id: c.id,
          column: c.column,
          direction: c.direction,
          nullsPosition: c.nullsPosition
        }
        if (mode === 'random') {
          return { ...base, mode: 'random', seed: c.mode === 'random' ? c.seed : newSeed() }
        }
        return { ...base, mode }
      })
    },
    [transformChip]
  )

  const setNulls = React.useCallback(
    (id: string, position: NullsPosition) => {
      transformChip(id, (c) => ({ ...c, nullsPosition: position }))
    },
    [transformChip]
  )

  const reseed = React.useCallback(
    (id: string) => {
      transformChip(id, (c) => (c.mode === 'random' ? { ...c, seed: newSeed() } : c))
    },
    [transformChip]
  )

  const movePriority = React.useCallback(
    (id: string, delta: number) => {
      const idx = chips.findIndex((c) => c.id === id)
      if (idx < 0) return
      const target = Math.max(0, Math.min(chips.length - 1, idx + delta))
      if (target === idx) return
      const next = chips.slice()
      const [moved] = next.splice(idx, 1)
      next.splice(target, 0, moved)
      onChipsChange(next)
    },
    [chips, onChipsChange]
  )

  const clearAll = React.useCallback(() => {
    onChipsChange([])
    cancelPicking()
  }, [onChipsChange, cancelPicking])

  const handleDragStart = React.useCallback((id: string, e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const handleDragOver = React.useCallback(
    (id: string, e: React.DragEvent) => {
      if (!dragId || dragId === id) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverId(id)
    },
    [dragId]
  )

  const handleDrop = React.useCallback(
    (targetId: string, e: React.DragEvent) => {
      e.preventDefault()
      if (!dragId || dragId === targetId) {
        setDragId(null)
        setDragOverId(null)
        return
      }
      const fromIdx = chips.findIndex((c) => c.id === dragId)
      const toIdx = chips.findIndex((c) => c.id === targetId)
      if (fromIdx < 0 || toIdx < 0) {
        setDragId(null)
        setDragOverId(null)
        return
      }
      const next = chips.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      onChipsChange(next)
      setDragId(null)
      setDragOverId(null)
    },
    [dragId, chips, onChipsChange]
  )

  const handleDragEnd = React.useCallback(() => {
    setDragId(null)
    setDragOverId(null)
  }, [])

  const dropdownRowCount = filteredColumns.length + availablePresets.length

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelPicking()
        inputRef.current?.blur()
        return
      }
      if (e.key === 'Backspace' && !query && chips.length > 0 && !isPicking) {
        e.preventDefault()
        removeChip(chips[chips.length - 1].id)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        // With both lists empty there is no row to land on; clamping to -1 would make
        // the next Enter index off the front of the presets array.
        if (dropdownRowCount === 0) return
        setHighlighted((i) => Math.min(i + 1, dropdownRowCount - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (highlighted < 0) return
        if (highlighted < availablePresets.length) {
          const preset = availablePresets[highlighted]
          if (preset) applyPreset(preset)
        } else {
          const colIdx = highlighted - availablePresets.length
          const col = filteredColumns[colIdx]
          if (col) addChip(col)
        }
      }
    },
    [
      query,
      chips,
      isPicking,
      dropdownRowCount,
      highlighted,
      availablePresets,
      filteredColumns,
      cancelPicking,
      removeChip,
      applyPreset,
      addChip
    ]
  )

  React.useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'S' || e.key === 's'))) return
      if (!barRef.current || barRef.current.offsetParent === null) return
      const target = e.target as HTMLElement | null
      if (target) {
        if (target.closest('.monaco-editor') || target.closest('[data-monaco-editor]')) return
        const isEditable =
          target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (isEditable && target !== inputRef.current && !barRef.current.contains(target)) return
      }
      e.preventDefault()
      if (!isPicking) startPicking()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onGlobalKey)
    return () => document.removeEventListener('keydown', onGlobalKey)
  }, [isPicking, startPicking])

  React.useEffect(() => {
    if (!isPicking) return
    const onClickOutside = (e: MouseEvent) => {
      if (
        barRef.current &&
        !barRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        cancelPicking()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isPicking, cancelPicking])

  React.useEffect(() => {
    if (!isPicking || !dropdownRef.current) return
    const el = dropdownRef.current.querySelector('[data-highlighted="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, isPicking])

  const hasSort = chips.length > 0
  const placeholder = hasSort ? 'Add sort…' : 'Sort rows… (\u2318\u21E7S)'

  return (
    <div className={cn('relative', className)}>
      <div
        ref={barRef}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 border-b',
          'transition-[border-color,background-color] duration-200 ease-out',
          hasSort ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/30'
        )}
      >
        <ArrowDownUp
          className={cn(
            'size-3.5 shrink-0 transition-colors duration-200',
            hasSort ? 'text-primary/70' : 'text-muted-foreground/50'
          )}
        />

        <div
          role="list"
          aria-label="Active sort priorities"
          className="flex items-center gap-1 flex-wrap flex-1 min-w-0"
        >
          {chips.map((chip, idx) => {
            const col = columnByName.get(chip.column)
            return (
              <SortChipItem
                key={chip.id}
                chip={chip}
                rank={idx + 1}
                totalChips={chips.length}
                column={col}
                isDragging={dragId === chip.id}
                isDragTarget={dragOverId === chip.id && dragId !== chip.id}
                onToggleDirection={() => toggleDirection(chip.id)}
                onSetMode={(mode) => setMode(chip.id, mode)}
                onSetNulls={(pos) => setNulls(chip.id, pos)}
                onCycleMode={() => cycleMode(chip.id)}
                onReseed={() => reseed(chip.id)}
                onRemove={() => removeChip(chip.id)}
                onMovePriority={(delta) => movePriority(chip.id, delta)}
                onDragStart={(e) => handleDragStart(chip.id, e)}
                onDragOver={(e) => handleDragOver(chip.id, e)}
                onDrop={(e) => handleDrop(chip.id, e)}
                onDragEnd={handleDragEnd}
              />
            )
          })}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (!isPicking) startPicking()
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              'flex-1 min-w-[120px] h-6 bg-transparent text-xs outline-none',
              'placeholder:text-muted-foreground/40'
            )}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasSort && (
            <SortStatus
              scope={scope}
              isSortingOnServer={isSortingOnServer}
              onSortWholeSet={onSortWholeSet}
            />
          )}

          {hasSort && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              onClick={clearAll}
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {isPicking && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute left-0 top-full z-50 mt-0.5',
            'w-80 max-h-72 overflow-auto',
            'rounded-lg border border-border/60 bg-popover shadow-lg',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150'
          )}
        >
          {availablePresets.length > 0 && (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider border-b border-border/30">
                Quick presets
              </div>
              {availablePresets.map((preset, i) => {
                const Icon = preset.icon
                const isHi = i === highlighted
                return (
                  <button
                    type="button"
                    key={preset.id}
                    data-highlighted={isHi}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs',
                      'cursor-pointer transition-colors duration-75',
                      isHi
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground/80 hover:bg-muted/60'
                    )}
                    onClick={() => applyPreset(preset)}
                    onMouseEnter={() => setHighlighted(i)}
                  >
                    <Icon className="size-3 text-primary/70 shrink-0" />
                    <span className="font-medium">{preset.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/70 truncate">
                      {preset.description}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {filteredColumns.length > 0 && (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider border-y border-border/30">
                {query ? 'Matching columns' : 'Columns'}
              </div>
              {filteredColumns.map((col, i) => {
                const idx = i + availablePresets.length
                const isHi = idx === highlighted
                return (
                  <button
                    type="button"
                    key={col.name}
                    data-highlighted={isHi}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 text-xs',
                      'cursor-pointer transition-colors duration-75',
                      isHi
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground/80 hover:bg-muted/60'
                    )}
                    onClick={() => addChip(col)}
                    onMouseEnter={() => setHighlighted(idx)}
                  >
                    <span className="font-medium">{col.name}</span>
                    <span className={cn('text-[10px]', getTypeColor(col.dataType))}>
                      {col.dataType}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {filteredColumns.length === 0 && availablePresets.length === 0 && (
            <div className="px-2.5 py-4 text-xs text-muted-foreground/60 text-center">
              No matching columns or presets
            </div>
          )}

          {availableColumns.length === 0 && query === '' && (
            <div className="px-2.5 py-2 text-[10px] text-muted-foreground/60 text-center border-t border-border/30">
              All columns are in the sort stack
            </div>
          )}
        </div>
      )}
    </div>
  )
}
