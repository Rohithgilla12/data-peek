import * as React from 'react'
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  X,
  Shuffle,
  Dices,
  CircleDashed,
  CircleDot,
  GripVertical,
  Sparkles,
  Clock,
  CalendarDays,
  CalendarClock,
  Ruler,
  Sigma,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowDown01,
  ArrowDown10
} from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import { getTypeColor } from '@/lib/type-colors'

export interface SortColumn {
  name: string
  dataType: string
}

export type SortDirection = 'asc' | 'desc'
export type NullsPosition = 'first' | 'last'

export type SortMode =
  | 'default'
  | 'natural'
  | 'length'
  | 'absolute'
  | 'byMonth'
  | 'byDayOfWeek'
  | 'byTime'
  | 'random'

interface SortChipBase {
  id: string
  column: string
  direction: SortDirection
  nullsPosition: NullsPosition
}

export type SortChip =
  | (SortChipBase & { mode: Exclude<SortMode, 'random'>; seed?: never })
  | (SortChipBase & { mode: 'random'; seed: number })

export type TypeCategory = 'bool' | 'numeric' | 'date' | 'string'

function getTypeCategory(dataType: string): TypeCategory {
  const lower = dataType.toLowerCase()
  if (lower.includes('bool')) return 'bool'
  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('real') ||
    lower.includes('money') ||
    lower.includes('serial') ||
    lower.includes('bigint')
  )
    return 'numeric'
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time')) return 'date'
  return 'string'
}

interface ModeOption {
  value: SortMode
  label: string
  short: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const STRING_MODES: ModeOption[] = [
  {
    value: 'default',
    label: 'Alphabetic',
    short: 'A→Z',
    description: 'Standard lexical order',
    icon: ArrowDownAZ
  },
  {
    value: 'natural',
    label: 'Natural',
    short: 'nat',
    description: 'item2 before item10',
    icon: Sparkles
  },
  {
    value: 'length',
    label: 'By length',
    short: 'len',
    description: 'Shortest to longest',
    icon: Ruler
  },
  {
    value: 'random',
    label: 'Shuffle',
    short: 'rand',
    description: 'Random seeded order',
    icon: Shuffle
  }
]

const NUMERIC_MODES: ModeOption[] = [
  {
    value: 'default',
    label: 'Numeric',
    short: '1→9',
    description: 'Lowest to highest',
    icon: ArrowDown01
  },
  {
    value: 'absolute',
    label: 'Absolute',
    short: '|x|',
    description: 'By distance from zero',
    icon: Sigma
  },
  {
    value: 'random',
    label: 'Shuffle',
    short: 'rand',
    description: 'Random seeded order',
    icon: Shuffle
  }
]

const DATE_MODES: ModeOption[] = [
  {
    value: 'default',
    label: 'Chronological',
    short: 'time',
    description: 'Oldest to newest',
    icon: Clock
  },
  {
    value: 'byMonth',
    label: 'By month',
    short: 'month',
    description: 'Group Jan…Dec',
    icon: CalendarDays
  },
  {
    value: 'byDayOfWeek',
    label: 'By weekday',
    short: 'dow',
    description: 'Group Mon…Sun',
    icon: CalendarClock
  },
  {
    value: 'byTime',
    label: 'Time of day',
    short: 'tod',
    description: '00:00 → 23:59 only',
    icon: Clock
  },
  {
    value: 'random',
    label: 'Shuffle',
    short: 'rand',
    description: 'Random seeded order',
    icon: Shuffle
  }
]

const BOOL_MODES: ModeOption[] = [
  {
    value: 'default',
    label: 'Boolean',
    short: 't/f',
    description: 'True before false',
    icon: CircleDot
  },
  {
    value: 'random',
    label: 'Shuffle',
    short: 'rand',
    description: 'Random seeded order',
    icon: Shuffle
  }
]

function modesForType(dataType: string): ModeOption[] {
  const cat = getTypeCategory(dataType)
  if (cat === 'numeric') return NUMERIC_MODES
  if (cat === 'date') return DATE_MODES
  if (cat === 'bool') return BOOL_MODES
  return STRING_MODES
}

function defaultDirectionForType(dataType: string): SortDirection {
  const cat = getTypeCategory(dataType)
  if (cat === 'date' || cat === 'numeric') return 'desc'
  return 'asc'
}

function modeLabel(chip: SortChip, col: SortColumn | undefined): string {
  if (!col) return chip.mode
  const modes = modesForType(col.dataType)
  const found = modes.find((m) => m.value === chip.mode)
  return found?.short ?? chip.mode
}

function nextChipId(): string {
  return crypto.randomUUID()
}

function mulberry32(seed: number): () => number {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function monthOfValue(v: unknown): number {
  if (v == null) return -1
  const d = new Date(String(v))
  const t = d.getTime()
  if (Number.isNaN(t)) return -1
  return d.getMonth()
}

function dayOfWeekOfValue(v: unknown): number {
  if (v == null) return -1
  const d = new Date(String(v))
  const t = d.getTime()
  if (Number.isNaN(t)) return -1
  return (d.getDay() + 6) % 7
}

function timeOfDayOfValue(v: unknown): number {
  if (v == null) return -1
  const d = new Date(String(v))
  const t = d.getTime()
  if (Number.isNaN(t)) return -1
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const plainCollator = new Intl.Collator(undefined, { sensitivity: 'base' })

function resolveNullOrder(
  aInvalid: boolean,
  bInvalid: boolean,
  nullsPosition: NullsPosition
): number | null {
  if (aInvalid && bInvalid) return 0
  if (aInvalid) return nullsPosition === 'first' ? -1 : 1
  if (bInvalid) return nullsPosition === 'first' ? 1 : -1
  return null
}

function compareByChip(
  chip: SortChip,
  xIndex: number,
  yIndex: number,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  category: TypeCategory,
  randomValues: number[] | undefined
): number {
  const va = a[chip.column]
  const vb = b[chip.column]

  const aNull = va === null || va === undefined || va === ''
  const bNull = vb === null || vb === undefined || vb === ''
  const nullOrder = resolveNullOrder(aNull, bNull, chip.nullsPosition)
  if (nullOrder !== null) return nullOrder

  const mul = chip.direction === 'asc' ? 1 : -1

  if (chip.mode === 'random' && randomValues) {
    return (randomValues[xIndex] - randomValues[yIndex]) * mul
  }

  if (chip.mode === 'length') {
    return (String(va).length - String(vb).length) * mul
  }

  if (chip.mode === 'natural') {
    return naturalCollator.compare(String(va), String(vb)) * mul
  }

  if (chip.mode === 'absolute') {
    const na = Math.abs(Number(va))
    const nb = Math.abs(Number(vb))
    const aBad = Number.isNaN(na)
    const bBad = Number.isNaN(nb)
    const order = resolveNullOrder(aBad, bBad, chip.nullsPosition)
    if (order !== null) return order
    return (na - nb) * mul
  }

  if (chip.mode === 'byMonth') {
    const ma = monthOfValue(va)
    const mb = monthOfValue(vb)
    const order = resolveNullOrder(ma < 0, mb < 0, chip.nullsPosition)
    if (order !== null) return order
    return (ma - mb) * mul
  }

  if (chip.mode === 'byDayOfWeek') {
    const da = dayOfWeekOfValue(va)
    const db = dayOfWeekOfValue(vb)
    const order = resolveNullOrder(da < 0, db < 0, chip.nullsPosition)
    if (order !== null) return order
    return (da - db) * mul
  }

  if (chip.mode === 'byTime') {
    const ta = timeOfDayOfValue(va)
    const tb = timeOfDayOfValue(vb)
    const order = resolveNullOrder(ta < 0, tb < 0, chip.nullsPosition)
    if (order !== null) return order
    return (ta - tb) * mul
  }

  if (category === 'numeric') {
    const na = Number(va)
    const nb = Number(vb)
    const order = resolveNullOrder(Number.isNaN(na), Number.isNaN(nb), chip.nullsPosition)
    if (order !== null) return order
    return (na - nb) * mul
  }

  if (category === 'date') {
    const ta = new Date(String(va)).getTime()
    const tb = new Date(String(vb)).getTime()
    const order = resolveNullOrder(Number.isNaN(ta), Number.isNaN(tb), chip.nullsPosition)
    if (order !== null) return order
    return (ta - tb) * mul
  }

  if (category === 'bool') {
    const aBool = va === true || va === 't' || va === 'true' || va === 1 ? 1 : 0
    const bBool = vb === true || vb === 't' || vb === 'true' || vb === 1 ? 1 : 0
    return (bBool - aBool) * mul
  }

  return plainCollator.compare(String(va), String(vb)) * mul
}

export function applySorts<T extends Record<string, unknown>>(
  rows: T[],
  chips: SortChip[],
  columns: SortColumn[] = []
): T[] {
  if (chips.length === 0) return rows

  const categoryByColumn = new Map<string, TypeCategory>()
  for (const c of columns) categoryByColumn.set(c.name, getTypeCategory(c.dataType))

  const randomValuesByChip = new Map<string, number[]>()
  for (const chip of chips) {
    if (chip.mode !== 'random') continue
    const rng = mulberry32(chip.seed)
    const arr = new Array<number>(rows.length)
    for (let i = 0; i < rows.length; i++) arr[i] = rng()
    randomValuesByChip.set(chip.id, arr)
  }

  const withIndex = rows.map((r, i) => ({ r, i }))
  withIndex.sort((x, y) => {
    for (const chip of chips) {
      const category = categoryByColumn.get(chip.column) ?? 'string'
      const randomValues = randomValuesByChip.get(chip.id)
      const c = compareByChip(chip, x.i, y.i, x.r, y.r, category, randomValues)
      if (c !== 0) return c
    }
    return x.i - y.i
  })
  return withIndex.map((w) => w.r)
}

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

interface SortChipButtonProps {
  chip: SortChip
  rank: number
  totalChips: number
  column: SortColumn | undefined
  isDragging: boolean
  isDragTarget: boolean
  onToggleDirection: () => void
  onCycleMode: () => void
  onToggleNulls: () => void
  onReseed: () => void
  onRemove: () => void
  onMovePriority: (delta: number) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function SortChipButton({
  chip,
  rank,
  totalChips,
  column,
  isDragging,
  isDragTarget,
  onToggleDirection,
  onCycleMode,
  onToggleNulls,
  onReseed,
  onRemove,
  onMovePriority,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: SortChipButtonProps) {
  const [isNew, setIsNew] = React.useState(true)
  const [flipKey, setFlipKey] = React.useState(0)

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
  const showMode = chip.mode !== 'default' || isRandom

  const ariaLabel = `Sort ${chip.column} ${chip.direction}${
    showMode ? ', mode ' + modeShort : ''
  }, priority ${rank} of ${totalChips}`

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
        'group/chip relative flex items-center gap-1 pl-1 pr-1 py-0.5 rounded-md text-xs',
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
      <span className="inline-flex items-center pl-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity duration-150">
        <GripVertical className="size-3 text-muted-foreground/60" />
      </span>

      <PriorityBadge rank={rank} />

      <span className={cn('font-medium px-0.5', typeColor)}>{chip.column}</span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleDirection()
        }}
        title={`Direction: ${chip.direction}${isRandom ? ' (n/a for shuffle)' : ''}`}
        className={cn(
          'inline-flex items-center justify-center size-4 rounded-sm',
          'hover:bg-primary/10 text-foreground/80 hover:text-primary',
          'transition-colors duration-100',
          isRandom && 'opacity-40'
        )}
        disabled={isRandom}
      >
        <span
          key={flipKey}
          className="inline-flex motion-safe:animate-in motion-safe:spin-in-180 motion-safe:duration-200"
        >
          {chip.direction === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
        </span>
      </button>

      {showMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onCycleMode()
          }}
          title="Cycle sort mode"
          className={cn(
            'px-1 py-0 rounded-sm text-[9px] font-mono lowercase',
            'text-primary/80 hover:text-primary bg-primary/[0.08] hover:bg-primary/15',
            'transition-colors duration-100'
          )}
        >
          {modeShort}
        </button>
      )}

      {isRandom && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReseed()
          }}
          title={`Seed: ${chip.seed} — click to reroll`}
          className={cn(
            'inline-flex items-center justify-center size-4 rounded-sm',
            'hover:bg-primary/10 text-foreground/70 hover:text-primary',
            'transition-[color,background-color,transform] duration-150',
            'hover:rotate-12'
          )}
        >
          <Dices className="size-3" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleNulls()
        }}
        title={`Nulls ${chip.nullsPosition}`}
        className={cn(
          'inline-flex items-center justify-center size-4 rounded-sm opacity-0 group-hover/chip:opacity-100',
          'text-muted-foreground hover:text-foreground hover:bg-muted/80',
          'transition-opacity duration-150'
        )}
      >
        {chip.nullsPosition === 'first' ? (
          <CircleDashed className="size-3" />
        ) : (
          <CircleDot className="size-3" />
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className={cn(
          'ml-0.5 inline-flex items-center justify-center size-4 rounded-sm',
          'opacity-0 group-hover/chip:opacity-100',
          'text-muted-foreground hover:text-foreground hover:bg-muted/80',
          'transition-opacity duration-100'
        )}
        title="Remove sort"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

interface PresetDef {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  build: (cols: SortColumn[]) => SortChip[] | null
}

function pickColumn(cols: SortColumn[], category: TypeCategory): SortColumn | undefined {
  return cols.find((c) => getTypeCategory(c.dataType) === category)
}

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}

function makeChip(col: SortColumn, direction: SortDirection, mode: SortMode = 'default'): SortChip {
  const base = {
    id: nextChipId(),
    column: col.name,
    direction,
    nullsPosition: 'last' as const
  }
  if (mode === 'random') {
    return { ...base, mode: 'random', seed: newSeed() }
  }
  return { ...base, mode }
}

const PRESETS: PresetDef[] = [
  {
    id: 'newest',
    label: 'Newest first',
    icon: CalendarClock,
    description: 'Sort by the first timestamp, descending',
    build: (cols) => {
      const col = pickColumn(cols, 'date')
      return col ? [makeChip(col, 'desc')] : null
    }
  },
  {
    id: 'oldest',
    label: 'Oldest first',
    icon: Clock,
    description: 'Sort by the first timestamp, ascending',
    build: (cols) => {
      const col = pickColumn(cols, 'date')
      return col ? [makeChip(col, 'asc')] : null
    }
  },
  {
    id: 'az',
    label: 'A → Z',
    icon: ArrowDownAZ,
    description: 'First text column, alphabetical',
    build: (cols) => {
      const col = pickColumn(cols, 'string')
      return col ? [makeChip(col, 'asc')] : null
    }
  },
  {
    id: 'za',
    label: 'Z → A',
    icon: ArrowDownZA,
    description: 'First text column, reversed',
    build: (cols) => {
      const col = pickColumn(cols, 'string')
      return col ? [makeChip(col, 'desc')] : null
    }
  },
  {
    id: 'largest',
    label: 'Largest first',
    icon: ArrowDown10,
    description: 'First numeric column, descending',
    build: (cols) => {
      const col = pickColumn(cols, 'numeric')
      return col ? [makeChip(col, 'desc')] : null
    }
  },
  {
    id: 'smallest',
    label: 'Smallest first',
    icon: ArrowDown01,
    description: 'First numeric column, ascending',
    build: (cols) => {
      const col = pickColumn(cols, 'numeric')
      return col ? [makeChip(col, 'asc')] : null
    }
  },
  {
    id: 'shuffle',
    label: 'Shuffle',
    icon: Shuffle,
    description: 'Random seeded order (any column)',
    build: (cols) => {
      const col = cols[0]
      return col ? [makeChip(col, 'asc', 'random')] : null
    }
  }
]

interface SmartSortBarProps {
  columns: SortColumn[]
  chips: SortChip[]
  onChipsChange: (chips: SortChip[]) => void
  onApplyToQuery?: () => void
  className?: string
}

export function SmartSortBar({
  columns,
  chips,
  onChipsChange,
  onApplyToQuery,
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

  const toggleNulls = React.useCallback(
    (id: string) => {
      transformChip(id, (c) => ({
        ...c,
        nullsPosition: c.nullsPosition === 'first' ? 'last' : 'first'
      }))
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
        if (highlighted < availablePresets.length) {
          applyPreset(availablePresets[highlighted])
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
              <SortChipButton
                key={chip.id}
                chip={chip}
                rank={idx + 1}
                totalChips={chips.length}
                column={col}
                isDragging={dragId === chip.id}
                isDragTarget={dragOverId === chip.id && dragId !== chip.id}
                onToggleDirection={() => toggleDirection(chip.id)}
                onCycleMode={() => cycleMode(chip.id)}
                onToggleNulls={() => toggleNulls(chip.id)}
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

        <div className="flex items-center gap-1.5 shrink-0">
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

          {hasSort && onApplyToQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-primary/80 hover:text-primary gap-1"
              onClick={onApplyToQuery}
              title="Push sort into ORDER BY clause"
            >
              <Sparkles className="size-3" />
              Apply
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

export function toggleColumnSort(
  chips: SortChip[],
  column: SortColumn,
  opts: { multi?: boolean } = {}
): SortChip[] {
  const existing = chips.find((c) => c.column === column.name)

  if (!existing) {
    const newChip: SortChip = {
      id: nextChipId(),
      column: column.name,
      direction: defaultDirectionForType(column.dataType),
      mode: 'default',
      nullsPosition: 'last'
    }
    return opts.multi ? [...chips, newChip] : [newChip]
  }

  const flipped: SortChip = {
    ...existing,
    direction: existing.direction === 'asc' ? 'desc' : 'asc'
  }
  if (opts.multi) return chips.map((c) => (c.id === existing.id ? flipped : c))
  return [flipped]
}
