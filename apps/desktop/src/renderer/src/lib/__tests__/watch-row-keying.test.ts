import { describe, it, expect } from 'vitest'
import { pickKeyingPlan, deriveRowKey } from '../watch-row-keying'

describe('pickKeyingPlan', () => {
  it('honors explicit key columns when all present in fields', () => {
    const plan = pickKeyingPlan({
      explicitKeyColumns: ['org_id', 'user_id'],
      fieldNames: ['org_id', 'user_id', 'email']
    })
    expect(plan).toEqual({
      strategy: 'primary_key',
      keyColumns: ['org_id', 'user_id']
    })
  })

  it('ignores explicit keys when one is missing', () => {
    const plan = pickKeyingPlan({
      explicitKeyColumns: ['id', 'missing'],
      fieldNames: ['id', 'email']
    })
    // Falls back to the heuristic which finds `id`.
    expect(plan).toEqual({ strategy: 'primary_key', keyColumns: ['id'] })
  })

  it('falls back to id heuristic', () => {
    const plan = pickKeyingPlan({
      fieldNames: ['id', 'email', 'created_at']
    })
    expect(plan).toEqual({ strategy: 'primary_key', keyColumns: ['id'] })
  })

  it('uses uuid when no id', () => {
    const plan = pickKeyingPlan({
      fieldNames: ['uuid', 'name']
    })
    expect(plan.strategy).toBe('primary_key')
    expect(plan.keyColumns).toEqual(['uuid'])
  })

  it('uses *_id when no id/uuid', () => {
    const plan = pickKeyingPlan({
      fieldNames: ['order_id', 'amount']
    })
    expect(plan).toEqual({ strategy: 'primary_key', keyColumns: ['order_id'] })
  })

  it('falls back to row_position when nothing identifies', () => {
    const plan = pickKeyingPlan({
      fieldNames: ['name', 'email', 'count']
    })
    expect(plan).toEqual({ strategy: 'row_position', keyColumns: [] })
  })
})

describe('deriveRowKey', () => {
  it('row_position uses index', () => {
    const k = deriveRowKey({ id: 7 }, { strategy: 'row_position', keyColumns: [] }, 3)
    expect(k).toBe('#3')
  })

  it('primary_key uses serialized column', () => {
    const k = deriveRowKey({ id: 42, x: 1 }, { strategy: 'primary_key', keyColumns: ['id'] }, 0)
    expect(k).toBe('42')
  })

  it('composite primary_key joins column values', () => {
    const a = deriveRowKey(
      { org_id: 1, user_id: 7 },
      { strategy: 'primary_key', keyColumns: ['org_id', 'user_id'] },
      0
    )
    const b = deriveRowKey(
      { org_id: 1, user_id: 8 },
      { strategy: 'primary_key', keyColumns: ['org_id', 'user_id'] },
      1
    )
    expect(a).not.toBe(b)
  })

  it('falls back to position when key columns are all null', () => {
    const k = deriveRowKey(
      { id: null, name: 'x' },
      { strategy: 'primary_key', keyColumns: ['id'] },
      5
    )
    expect(k).toBe('#5')
  })

  it('handles Date values', () => {
    const k1 = deriveRowKey(
      { ts: new Date('2026-01-01T00:00:00Z') },
      { strategy: 'primary_key', keyColumns: ['ts'] },
      0
    )
    const k2 = deriveRowKey(
      { ts: new Date('2026-01-01T00:00:00Z') },
      { strategy: 'primary_key', keyColumns: ['ts'] },
      1
    )
    expect(k1).toBe(k2)
  })

  it('handles object values via JSON', () => {
    const k1 = deriveRowKey(
      { meta: { a: 1 } },
      { strategy: 'primary_key', keyColumns: ['meta'] },
      0
    )
    const k2 = deriveRowKey(
      { meta: { a: 1 } },
      { strategy: 'primary_key', keyColumns: ['meta'] },
      0
    )
    expect(k1).toBe(k2)
  })
})
