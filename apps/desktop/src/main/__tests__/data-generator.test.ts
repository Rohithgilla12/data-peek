import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ColumnGenerator, DataGenConfig } from '@shared/index'
import { generateRows } from '../data-generator'

function column(overrides: Partial<ColumnGenerator>): ColumnGenerator {
  return {
    columnName: 'col',
    dataType: 'text',
    generatorType: 'faker',
    nullPercentage: 0,
    skip: false,
    ...overrides
  }
}

function config(seed: number | undefined): DataGenConfig {
  return {
    schema: 'public',
    table: 'orders',
    rowCount: 200,
    seed,
    batchSize: 100,
    columns: [
      column({
        columnName: 'status',
        generatorType: 'random-enum',
        enumValues: ['a', 'b', 'c', 'd']
      }),
      column({
        columnName: 'user_id',
        generatorType: 'fk-reference',
        fkTable: 'users',
        fkColumn: 'id'
      }),
      column({ columnName: 'note', fakerMethod: 'lorem.word', nullPercentage: 50 })
    ]
  }
}

const fkData = new Map<string, unknown[]>([['users.id', [1, 2, 3, 4, 5, 6, 7, 8]]])

describe('generateRows', () => {
  it('generates identical rows for the same seed, nulls, enum picks and FK picks included', () => {
    const first = generateRows(config(42), fkData)
    const second = generateRows(config(42), fkData)

    expect(second).toEqual(first)
    expect(first.some((row) => row[2] === null)).toBe(true)
    expect(first.some((row) => row[2] !== null)).toBe(true)
  })

  it('generates different rows for a different seed', () => {
    expect(generateRows(config(43), fkData)).not.toEqual(generateRows(config(42), fkData))
  })

  it('draws an enum value and an FK value from the ones it was given', () => {
    for (const [status, userId] of generateRows(config(7), fkData)) {
      expect(['a', 'b', 'c', 'd']).toContain(status)
      expect(fkData.get('users.id')).toContain(userId)
    }
  })

  it('keeps generating without a seed', () => {
    const rows = generateRows(config(undefined), fkData)

    expect(rows).toHaveLength(200)
    expect(rows[0]).toHaveLength(3)
  })
})

describe('generateRows with random-date columns', () => {
  const DAY = 24 * 60 * 60 * 1000

  function dates(seed: number | undefined, bounds: Partial<ColumnGenerator> = {}): string[] {
    const rows = generateRows(
      {
        schema: 'public',
        table: 'orders',
        rowCount: 50,
        seed,
        batchSize: 100,
        columns: [column({ columnName: 'created_at', generatorType: 'random-date', ...bounds })]
      },
      fkData
    )
    return rows.map((row) => row[0] as string)
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates identical dates for the same seed whatever the clock says', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const first = dates(42)
    vi.setSystemTime(new Date('2031-07-15T12:34:56Z'))
    const second = dates(42)

    expect(second).toEqual(first)
    expect(new Set(first).size).toBeGreaterThan(1)
  })

  it('keeps a seeded run reproducible when only one bound is set', () => {
    const min = Date.UTC(2030, 0, 1)
    const max = Date.UTC(2001, 5, 1)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const fromMin = dates(42, { minValue: min })
    const toMax = dates(42, { maxValue: max })
    vi.setSystemTime(new Date('2031-07-15T12:34:56Z'))

    expect(dates(42, { minValue: min })).toEqual(fromMin)
    expect(dates(42, { maxValue: max })).toEqual(toMax)
    // The missing bound is a year from the given one, never the clock.
    for (const value of fromMin) {
      expect(Date.parse(value)).toBeGreaterThanOrEqual(min)
      expect(Date.parse(value)).toBeLessThanOrEqual(min + 365 * DAY)
    }
    for (const value of toMax) {
      expect(Date.parse(value)).toBeGreaterThanOrEqual(max - 365 * DAY)
      expect(Date.parse(value)).toBeLessThanOrEqual(max)
    }
  })

  it('keeps both bounds when they are set', () => {
    const min = Date.UTC(2020, 0, 1)
    const max = Date.UTC(2020, 0, 31)

    for (const value of dates(42, { minValue: min, maxValue: max })) {
      expect(Date.parse(value)).toBeGreaterThanOrEqual(min)
      expect(Date.parse(value)).toBeLessThanOrEqual(max)
    }
  })

  it('generates identical faker dates for the same seed whatever the clock says', () => {
    // created_at / updated_at / deleted_at map to date.recent in the renderer
    // heuristic, and date.recent defaults its reference to "now".
    function fakerDates(seed: number | undefined): string[] {
      const rows = generateRows(
        {
          schema: 'public',
          table: 'orders',
          rowCount: 50,
          seed,
          batchSize: 100,
          columns: [column({ columnName: 'created_at', fakerMethod: 'date.recent' })]
        },
        fkData
      )
      return rows.map((row) => row[0] as string)
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const first = fakerDates(42)
    vi.setSystemTime(new Date('2031-07-15T12:34:56Z'))
    const second = fakerDates(42)

    expect(second).toEqual(first)
    expect(new Set(first).size).toBeGreaterThan(1)
  })

  it('still draws faker dates around now without a seed', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))

    const rows = generateRows(
      {
        schema: 'public',
        table: 'orders',
        rowCount: 50,
        seed: undefined,
        batchSize: 100,
        columns: [column({ columnName: 'created_at', fakerMethod: 'date.recent' })]
      },
      fkData
    )

    // date.recent defaults to days: 1, so the window is the day before the
    // reference. Measured over 5000 draws against @faker-js/faker 9.9.0: the
    // oldest lands exactly 1.0000 days back.
    for (const row of rows) {
      const value = Date.parse(row[0] as string)
      expect(value).toBeGreaterThanOrEqual(now - DAY)
      expect(value).toBeLessThanOrEqual(now)
    }
  })

  it('leaves the clock reference alone when a seeded run throws', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))

    // Nothing validates the IPC payload at runtime, so a renderer bug can send
    // a non-array column list and the filter is what throws.
    expect(() =>
      generateRows(
        {
          schema: 'public',
          table: 'orders',
          rowCount: 1,
          seed: 42,
          batchSize: 100,
          columns: '' as unknown as DataGenConfig['columns']
        },
        fkData
      )
    ).toThrow()

    const rows = generateRows(
      {
        schema: 'public',
        table: 'orders',
        rowCount: 50,
        seed: undefined,
        batchSize: 100,
        columns: [column({ columnName: 'created_at', fakerMethod: 'date.recent' })]
      },
      fkData
    )

    for (const row of rows) {
      const value = Date.parse(row[0] as string)
      expect(value).toBeGreaterThanOrEqual(now - DAY)
      expect(value).toBeLessThanOrEqual(now)
    }
  })

  it('still draws from the last year up to now without a seed', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))

    for (const value of dates(undefined)) {
      expect(Date.parse(value)).toBeGreaterThanOrEqual(now - 365 * DAY)
      expect(Date.parse(value)).toBeLessThanOrEqual(now)
    }
  })
})
