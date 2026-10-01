import { describe, expect, it } from 'vitest'
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
