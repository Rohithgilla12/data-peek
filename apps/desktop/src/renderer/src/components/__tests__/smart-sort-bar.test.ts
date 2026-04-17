import { describe, it, expect } from 'vitest'
import {
  applySorts,
  toggleColumnSort,
  type SortChip,
  type SortColumn
} from '@/components/smart-sort-bar'

type ChipInit = {
  id?: string
  column: string
  direction?: 'asc' | 'desc'
  mode?: SortChip['mode']
  nullsPosition?: 'first' | 'last'
  seed?: number
}

function chip(partial: ChipInit): SortChip {
  const base = {
    id: partial.id ?? 'id',
    column: partial.column,
    direction: partial.direction ?? 'asc',
    nullsPosition: partial.nullsPosition ?? 'last'
  }
  if (partial.mode === 'random') {
    return { ...base, mode: 'random', seed: partial.seed ?? 1 }
  }
  return { ...base, mode: partial.mode ?? 'default' }
}

const COL_N: SortColumn[] = [{ name: 'n', dataType: 'integer' }]
const COL_S: SortColumn[] = [{ name: 's', dataType: 'varchar' }]
const COL_D: SortColumn[] = [{ name: 'd', dataType: 'timestamp' }]
const COL_B: SortColumn[] = [{ name: 'b', dataType: 'boolean' }]

describe('applySorts', () => {
  it('returns original array when no chips', () => {
    const rows = [{ a: 1 }, { a: 2 }]
    expect(applySorts(rows, [])).toBe(rows)
  })

  it('sorts numerically ascending in default mode', () => {
    const rows = [{ n: 10 }, { n: 2 }, { n: 30 }]
    const sorted = applySorts(rows, [chip({ column: 'n', direction: 'asc' })], COL_N)
    expect(sorted.map((r) => r.n)).toEqual([2, 10, 30])
  })

  it('sorts numerically descending', () => {
    const rows = [{ n: 10 }, { n: 2 }, { n: 30 }]
    const sorted = applySorts(rows, [chip({ column: 'n', direction: 'desc' })], COL_N)
    expect(sorted.map((r) => r.n)).toEqual([30, 10, 2])
  })

  it('sorts strings lexically by default (no numeric sniffing)', () => {
    const rows = [{ s: 'item10' }, { s: 'item2' }, { s: 'item1' }]
    const sorted = applySorts(rows, [chip({ column: 's', direction: 'asc' })], COL_S)
    expect(sorted.map((r) => r.s)).toEqual(['item1', 'item10', 'item2'])
  })

  it('does not coerce numeric-looking strings to numbers in string column', () => {
    const rows = [{ s: '7' }, { s: '42' }, { s: '01234' }]
    const sorted = applySorts(rows, [chip({ column: 's', direction: 'asc' })], COL_S)
    expect(sorted.map((r) => r.s)).toEqual(['01234', '42', '7'])
  })

  it('sorts strings naturally when mode is natural', () => {
    const rows = [{ s: 'item10' }, { s: 'item2' }, { s: 'item1' }]
    const sorted = applySorts(
      rows,
      [chip({ column: 's', direction: 'asc', mode: 'natural' })],
      COL_S
    )
    expect(sorted.map((r) => r.s)).toEqual(['item1', 'item2', 'item10'])
  })

  it('sorts by string length', () => {
    const rows = [{ s: 'aaa' }, { s: 'a' }, { s: 'aa' }]
    const sorted = applySorts(
      rows,
      [chip({ column: 's', direction: 'asc', mode: 'length' })],
      COL_S
    )
    expect(sorted.map((r) => r.s)).toEqual(['a', 'aa', 'aaa'])
  })

  it('sorts numerics by absolute value', () => {
    const rows = [{ n: -5 }, { n: 2 }, { n: -1 }, { n: 3 }]
    const sorted = applySorts(
      rows,
      [chip({ column: 'n', direction: 'asc', mode: 'absolute' })],
      COL_N
    )
    expect(sorted.map((r) => r.n)).toEqual([-1, 2, 3, -5])
  })

  it('applies multi-column sort with priority ordering', () => {
    const rows = [
      { g: 'a', n: 2 },
      { g: 'b', n: 1 },
      { g: 'a', n: 1 },
      { g: 'b', n: 2 }
    ]
    const cols: SortColumn[] = [
      { name: 'g', dataType: 'varchar' },
      { name: 'n', dataType: 'integer' }
    ]
    const sorted = applySorts(
      rows,
      [
        chip({ column: 'g', direction: 'asc', id: '1' }),
        chip({ column: 'n', direction: 'desc', id: '2' })
      ],
      cols
    )
    expect(sorted).toEqual([
      { g: 'a', n: 2 },
      { g: 'a', n: 1 },
      { g: 'b', n: 2 },
      { g: 'b', n: 1 }
    ])
  })

  it('places nulls last by default', () => {
    const rows = [{ n: 1 }, { n: null }, { n: 2 }]
    const sorted = applySorts(rows, [chip({ column: 'n', direction: 'asc' })], COL_N)
    expect(sorted.map((r) => r.n)).toEqual([1, 2, null])
  })

  it('places nulls first when configured', () => {
    const rows = [{ n: 1 }, { n: null }, { n: 2 }]
    const sorted = applySorts(
      rows,
      [chip({ column: 'n', direction: 'asc', nullsPosition: 'first' })],
      COL_N
    )
    expect(sorted.map((r) => r.n)).toEqual([null, 1, 2])
  })

  it('treats empty string as null', () => {
    const rows = [{ s: 'b' }, { s: '' }, { s: 'a' }]
    const sorted = applySorts(rows, [chip({ column: 's', direction: 'asc' })], COL_S)
    expect(sorted.map((r) => r.s)).toEqual(['a', 'b', ''])
  })

  it('respects per-chip nullsPosition independently in multi-column sort', () => {
    const rows = [
      { g: 'a', n: 1 },
      { g: 'a', n: null },
      { g: null, n: 99 },
      { g: 'b', n: 2 }
    ]
    const cols: SortColumn[] = [
      { name: 'g', dataType: 'varchar' },
      { name: 'n', dataType: 'integer' }
    ]
    const sorted = applySorts(
      rows,
      [
        chip({ column: 'g', direction: 'asc', id: '1', nullsPosition: 'first' }),
        chip({ column: 'n', direction: 'asc', id: '2', nullsPosition: 'last' })
      ],
      cols
    )
    expect(sorted).toEqual([
      { g: null, n: 99 },
      { g: 'a', n: 1 },
      { g: 'a', n: null },
      { g: 'b', n: 2 }
    ])
  })

  it('shuffles deterministically with same seed', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ i }))
    const cols: SortColumn[] = [{ name: 'i', dataType: 'integer' }]
    const a = applySorts(rows, [chip({ column: 'i', mode: 'random', seed: 42 })], cols)
    const b = applySorts(rows, [chip({ column: 'i', mode: 'random', seed: 42 })], cols)
    expect(a.map((r) => r.i)).toEqual(b.map((r) => r.i))
  })

  it('shuffles differently with different seeds', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ i }))
    const cols: SortColumn[] = [{ name: 'i', dataType: 'integer' }]
    const a = applySorts(rows, [chip({ column: 'i', mode: 'random', seed: 1 })], cols)
    const b = applySorts(rows, [chip({ column: 'i', mode: 'random', seed: 999 })], cols)
    expect(a.map((r) => r.i)).not.toEqual(b.map((r) => r.i))
  })

  it('uses independent seeds across multiple random chips', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ g: 'a', n: i }))
    const cols: SortColumn[] = [
      { name: 'g', dataType: 'varchar' },
      { name: 'n', dataType: 'integer' }
    ]
    const shuffleAOnly = applySorts(
      rows,
      [
        chip({ column: 'g', direction: 'asc', id: '1' }),
        chip({ column: 'n', direction: 'asc', id: '2', mode: 'random', seed: 13 })
      ],
      cols
    )
    const shuffleBOnly = applySorts(
      rows,
      [
        chip({ column: 'g', direction: 'asc', id: '1' }),
        chip({ column: 'n', direction: 'asc', id: '2', mode: 'random', seed: 99 })
      ],
      cols
    )
    expect(shuffleAOnly.map((r) => r.n)).not.toEqual(shuffleBOnly.map((r) => r.n))
  })

  it('groups dates by month when mode is byMonth', () => {
    const rows = [
      { id: 1, d: '2024-03-15' },
      { id: 2, d: '2024-01-20' },
      { id: 3, d: '2023-01-05' },
      { id: 4, d: '2024-03-01' }
    ]
    const cols: SortColumn[] = [
      { name: 'id', dataType: 'integer' },
      { name: 'd', dataType: 'timestamp' }
    ]
    const sorted = applySorts(
      rows,
      [chip({ column: 'd', direction: 'asc', mode: 'byMonth' })],
      cols
    )
    const months = sorted.map((r) => new Date(r.d).getMonth())
    expect(months).toEqual([0, 0, 2, 2])
  })

  it('sorts byDayOfWeek with Monday=0…Sunday=6', () => {
    const rows = [{ d: '2024-04-07' }, { d: '2024-04-01' }, { d: '2024-04-03' }]
    const sorted = applySorts(
      rows,
      [chip({ column: 'd', direction: 'asc', mode: 'byDayOfWeek' })],
      COL_D
    )
    expect(sorted.map((r) => new Date(r.d).getDay())).toEqual([1, 3, 0])
  })

  it('sorts byTime ignoring the date component', () => {
    const rows = [
      { d: '2024-01-01T15:00:00' },
      { d: '2023-06-15T03:00:00' },
      { d: '2025-12-31T09:00:00' }
    ]
    const sorted = applySorts(
      rows,
      [chip({ column: 'd', direction: 'asc', mode: 'byTime' })],
      COL_D
    )
    expect(sorted.map((r) => new Date(r.d).getHours())).toEqual([3, 9, 15])
  })

  it('routes invalid dates through the null path in byMonth', () => {
    const rows = [{ d: '2024-02-01' }, { d: 'not-a-date' }, { d: '2024-05-01' }]
    const sorted = applySorts(
      rows,
      [chip({ column: 'd', direction: 'asc', mode: 'byMonth', nullsPosition: 'last' })],
      COL_D
    )
    expect(sorted.map((r) => r.d)).toEqual(['2024-02-01', '2024-05-01', 'not-a-date'])
  })

  it('preserves input order for ties (stable sort)', () => {
    const rows = [
      { g: 'a', k: 1 },
      { g: 'a', k: 2 },
      { g: 'a', k: 3 }
    ]
    const cols: SortColumn[] = [
      { name: 'g', dataType: 'varchar' },
      { name: 'k', dataType: 'integer' }
    ]
    const sorted = applySorts(rows, [chip({ column: 'g', direction: 'asc' })], cols)
    expect(sorted.map((r) => r.k)).toEqual([1, 2, 3])
  })

  it('handles empty rows array', () => {
    const sorted = applySorts([], [chip({ column: 'n', direction: 'asc' })], COL_N)
    expect(sorted).toEqual([])
  })

  it('handles all-null column without throwing', () => {
    const rows = [{ n: null }, { n: null }, { n: null }]
    const sorted = applySorts(rows, [chip({ column: 'n', direction: 'asc' })], COL_N)
    expect(sorted).toHaveLength(3)
  })

  it('sorts boolean columns with true before false', () => {
    const rows = [{ b: false }, { b: true }, { b: false }, { b: true }]
    const sorted = applySorts(rows, [chip({ column: 'b', direction: 'asc' })], COL_B)
    expect(sorted.map((r) => r.b)).toEqual([true, true, false, false])
  })

  it('sorts timestamp strings chronologically in default mode', () => {
    const rows = [
      { d: '2024-03-15T10:00:00' },
      { d: '2023-01-05T09:00:00' },
      { d: '2024-01-20T08:00:00' }
    ]
    const sorted = applySorts(rows, [chip({ column: 'd', direction: 'asc' })], COL_D)
    expect(sorted.map((r) => r.d)).toEqual([
      '2023-01-05T09:00:00',
      '2024-01-20T08:00:00',
      '2024-03-15T10:00:00'
    ])
  })

  it('absolute mode routes non-numeric values through null path', () => {
    const rows = [{ n: -3 }, { n: 'x' }, { n: 1 }]
    const sorted = applySorts(
      rows,
      [chip({ column: 'n', direction: 'asc', mode: 'absolute', nullsPosition: 'last' })],
      COL_N
    )
    expect(sorted.map((r) => r.n)).toEqual([1, -3, 'x'])
  })
})

describe('toggleColumnSort', () => {
  const col: SortColumn = { name: 'price', dataType: 'numeric' }
  const textCol: SortColumn = { name: 'name', dataType: 'varchar' }
  const dateCol: SortColumn = { name: 'created_at', dataType: 'timestamp' }

  it('adds new chip when column is not sorted (single)', () => {
    const result = toggleColumnSort([], col)
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe('price')
    expect(result[0].direction).toBe('desc')
  })

  it('uses asc default for text columns', () => {
    const result = toggleColumnSort([], textCol)
    expect(result[0].direction).toBe('asc')
  })

  it('uses desc default for date columns', () => {
    const result = toggleColumnSort([], dateCol)
    expect(result[0].direction).toBe('desc')
  })

  it('replaces existing chips when not multi', () => {
    const initial = toggleColumnSort([], textCol)
    const next = toggleColumnSort(initial, col)
    expect(next).toHaveLength(1)
    expect(next[0].column).toBe('price')
  })

  it('appends when multi=true', () => {
    const initial = toggleColumnSort([], textCol)
    const next = toggleColumnSort(initial, col, { multi: true })
    expect(next).toHaveLength(2)
  })

  it('flips direction on existing chip', () => {
    const initial = toggleColumnSort([], col)
    expect(initial[0].direction).toBe('desc')
    const flipped = toggleColumnSort(initial, col)
    expect(flipped).toHaveLength(1)
    expect(flipped[0].direction).toBe('asc')
  })

  it('cycles direction without removing the chip', () => {
    const step1 = toggleColumnSort([], col)
    const step2 = toggleColumnSort(step1, col)
    const step3 = toggleColumnSort(step2, col)
    expect(step3).toHaveLength(1)
    expect(step3[0].direction).toBe('desc')
  })

  it('preserves mode and nullsPosition across direction flips', () => {
    const initial = toggleColumnSort([], dateCol)
    const customized: SortChip[] = [
      {
        id: initial[0].id,
        column: initial[0].column,
        direction: initial[0].direction,
        mode: 'byMonth',
        nullsPosition: 'first'
      }
    ]
    const flipped = toggleColumnSort(customized, dateCol)
    expect(flipped[0].mode).toBe('byMonth')
    expect(flipped[0].nullsPosition).toBe('first')
  })

  it('flips direction on date column in multi mode while preserving other chips', () => {
    const initial = toggleColumnSort([], col)
    const withDate = toggleColumnSort(initial, dateCol, { multi: true })
    expect(withDate).toHaveLength(2)
    const flippedDate = toggleColumnSort(withDate, dateCol, { multi: true })
    expect(flippedDate).toHaveLength(2)
    expect(flippedDate.find((c) => c.column === 'created_at')?.direction).toBe('asc')
    expect(flippedDate.find((c) => c.column === 'price')?.direction).toBe('desc')
  })
})
