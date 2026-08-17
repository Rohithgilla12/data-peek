import type * as React from 'react'
import {
  Shuffle,
  CircleDot,
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

export interface SortColumn {
  name: string
  dataType: string
}

export type SortDirection = 'asc' | 'desc'
export type NullsPosition = 'first' | 'last'

export type SortMode =
  'default' | 'natural' | 'length' | 'absolute' | 'byMonth' | 'byDayOfWeek' | 'byTime' | 'random'

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

/**
 * Whether a chip's intent survives being turned into an ORDER BY clause.
 *
 * `generateOrderByClause` emits nothing but `column ASC|DESC`, so every other part of a
 * chip is dropped on the way to the database. Sorting server-side while silently
 * discarding the mode would order rows by the plain column and still report the sort as
 * authoritative, which is the exact confusion the scope signal exists to prevent.
 *
 * Null placement is judged against the chip default rather than the dialect's: no clause
 * is emitted either way, so only an explicit choice is being lost. Postgres orders nulls
 * first on DESC regardless, and that mismatch is older than this check.
 */
export function isServerExpressibleSort(sort: {
  mode?: SortMode
  nullsPosition?: NullsPosition
}): boolean {
  return (sort.mode ?? 'default') === 'default' && (sort.nullsPosition ?? 'last') === 'last'
}

// Matched on word boundaries rather than as substrings: `includes('int')` also catches
// `interval`, `point` and `int4range`, none of which sort as numbers — an interval
// would be run through Number() and compare as NaN.
const NUMERIC_TYPE =
  /\b(smallint|integer|int|int2|int4|int8|bigint|numeric|decimal|dec|float|float4|float8|double|real|money|smallmoney|serial|smallserial|bigserial)\b/

const DATE_TYPE =
  /\b(timestamptz|timestamp|datetime2?|datetimeoffset|smalldatetime|date|time|timetz)\b/

export function getTypeCategory(dataType: string): TypeCategory {
  const lower = dataType.toLowerCase()
  if (/\bbool(ean)?\b/.test(lower)) return 'bool'
  if (NUMERIC_TYPE.test(lower)) return 'numeric'
  if (DATE_TYPE.test(lower)) return 'date'
  return 'string'
}

export interface ModeOption {
  value: SortMode
  label: string
  short: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

export const STRING_MODES: ModeOption[] = [
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

export const NUMERIC_MODES: ModeOption[] = [
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

export const DATE_MODES: ModeOption[] = [
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

export const BOOL_MODES: ModeOption[] = [
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

export function modesForType(dataType: string): ModeOption[] {
  const cat = getTypeCategory(dataType)
  if (cat === 'numeric') return NUMERIC_MODES
  if (cat === 'date') return DATE_MODES
  if (cat === 'bool') return BOOL_MODES
  return STRING_MODES
}

export function defaultDirectionForType(dataType: string): SortDirection {
  const cat = getTypeCategory(dataType)
  if (cat === 'date' || cat === 'numeric') return 'desc'
  return 'asc'
}

export function modeLabel(chip: SortChip, col: SortColumn | undefined): string {
  if (!col) return chip.mode
  const modes = modesForType(col.dataType)
  const found = modes.find((m) => m.value === chip.mode)
  return found?.short ?? chip.mode
}

export function nextChipId(): string {
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

export interface PresetDef {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  build: (cols: SortColumn[]) => SortChip[] | null
}

function pickColumn(cols: SortColumn[], category: TypeCategory): SortColumn | undefined {
  return cols.find((c) => getTypeCategory(c.dataType) === category)
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}

export function makeChip(
  col: SortColumn,
  direction: SortDirection,
  mode: SortMode = 'default'
): SortChip {
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

export const PRESETS: PresetDef[] = [
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
