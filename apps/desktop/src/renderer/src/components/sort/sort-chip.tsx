import * as React from 'react'
import { ArrowUp, ArrowDown, ChevronDown, Dices, X } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@data-peek/ui'
import {
  modeLabel,
  modesForType,
  type NullsPosition,
  type SortChip,
  type SortColumn,
  type SortMode
} from '@/lib/sort-model'
import { getTypeColor } from '@/lib/type-colors'

function PriorityBadge({ rank }: { rank: number }) {
  const classes =
    rank === 1
      ? 'bg-primary text-primary-foreground'
      : rank === 2
        ? 'bg-primary/70 text-primary-foreground'
        : rank === 3
          ? 'bg-primary/50 text-primary-foreground'
          : 'bg-primary/30 text-primary-foreground'

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center size-4 rounded-full',
        'text-[9px] font-mono font-semibold tabular-nums shrink-0',
        'transition-colors duration-200',
        classes
      )}
      aria-label={`Priority ${rank}`}
    >
      {rank}
    </span>
  )
}

interface SortChipItemProps {
  chip: SortChip
  rank: number
  totalChips: number
  column: SortColumn | undefined
  isDragging: boolean
  isDragTarget: boolean
  onToggleDirection: () => void
  onSetMode: (mode: SortMode) => void
  onSetNulls: (position: NullsPosition) => void
  onCycleMode: () => void
  onReseed: () => void
  onRemove: () => void
  onMovePriority: (delta: number) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export function SortChipItem({
  chip,
  rank,
  totalChips,
  column,
  isDragging,
  isDragTarget,
  onToggleDirection,
  onSetMode,
  onSetNulls,
  onCycleMode,
  onReseed,
  onRemove,
  onMovePriority,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: SortChipItemProps) {
  const [isNew, setIsNew] = React.useState(true)
  const [flipKey, setFlipKey] = React.useState(0)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setIsNew(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  React.useEffect(() => {
    setFlipKey((k) => k + 1)
  }, [chip.direction, chip.mode])

  const typeColor = column ? getTypeColor(column.dataType) : 'text-muted-foreground'
  const isRandom = chip.mode === 'random'
  const modeShort = modeLabel(chip, column)
  const modes = column ? modesForType(column.dataType) : []

  const ariaLabel = `Sort ${chip.column} ${chip.direction}, mode ${modeShort}, priority ${rank} of ${totalChips}`

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault()
      onMovePriority(-1)
      return
    }
    if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault()
      onMovePriority(1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      onRemove()
      return
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onToggleDirection()
      return
    }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault()
      onCycleMode()
    }
  }

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={ariaLabel}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      className={cn(
        'group/chip relative flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md text-xs',
        'border cursor-grab active:cursor-grabbing select-none',
        'transition-[border-color,background-color,transform,opacity,box-shadow] duration-150',
        'hover:border-primary/40 hover:bg-primary/5',
        'focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/40',
        isNew &&
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:slide-in-from-left-1 motion-safe:duration-200',
        isDragging && 'opacity-40 scale-95',
        isDragTarget && 'border-primary/60 bg-primary/10 ring-1 ring-primary/30 scale-[1.02]',
        !isDragging && !isDragTarget && 'border-border/60 bg-muted/50'
      )}
    >
      <PriorityBadge rank={rank} />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleDirection()
        }}
        disabled={isRandom}
        title={isRandom ? 'Direction does not apply to a shuffle' : `Direction: ${chip.direction}`}
        className={cn(
          'inline-flex items-center gap-1 px-0.5 rounded-sm',
          'hover:bg-primary/10 transition-colors duration-100',
          isRandom && 'cursor-default hover:bg-transparent'
        )}
      >
        <span className={cn('font-medium', typeColor)}>{chip.column}</span>
        <span
          key={flipKey}
          className={cn(
            'inline-flex text-foreground/80',
            'motion-safe:animate-in motion-safe:spin-in-180 motion-safe:duration-200',
            isRandom && 'opacity-40'
          )}
        >
          {chip.direction === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
        </span>
      </button>

      {chip.mode !== 'default' && (
        <span className="px-1 rounded-sm text-[9px] font-mono lowercase text-primary/80 bg-primary/[0.08]">
          {modeShort}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Sort options for ${chip.column}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex items-center justify-center size-4 rounded-sm',
              'text-muted-foreground hover:text-foreground hover:bg-muted/80',
              'transition-colors duration-100'
            )}
          >
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Mode
          </div>
          {modes.map((m) => {
            const Icon = m.icon
            return (
              <button
                type="button"
                key={m.value}
                onClick={() => {
                  onSetMode(m.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs text-left',
                  'transition-colors duration-75',
                  m.value === chip.mode
                    ? 'bg-primary/10 text-foreground'
                    : 'text-foreground/80 hover:bg-muted/60'
                )}
              >
                <Icon className="size-3 text-primary/70 shrink-0" />
                <span className="font-medium">{m.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/70 truncate">
                  {m.description}
                </span>
              </button>
            )
          })}

          <div className="mt-1 pt-1 border-t border-border/40">
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Nulls
            </div>
            <div className="flex gap-1 px-1 pb-1">
              {(['first', 'last'] as const).map((pos) => (
                <button
                  type="button"
                  key={pos}
                  onClick={() => onSetNulls(pos)}
                  className={cn(
                    'flex-1 px-2 py-1 rounded-sm text-xs capitalize transition-colors duration-75',
                    chip.nullsPosition === pos
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground/80 hover:bg-muted/60'
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {isRandom && (
            <div className="pt-1 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-7 text-xs gap-2"
                onClick={onReseed}
              >
                <Dices className="size-3" />
                Reroll seed
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                  {chip.seed}
                </span>
              </Button>
            </div>
          )}

          <div className="pt-1 border-t border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-7 text-xs gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpen(false)
                onRemove()
              }}
            >
              <X className="size-3" />
              Remove sort
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
