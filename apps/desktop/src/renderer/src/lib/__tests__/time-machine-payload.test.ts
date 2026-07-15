import { describe, it, expect } from 'vitest'
import { normalizeValue, toColumnarRows, recordsFromColumnar } from '../time-machine-payload'

describe('normalizeValue', () => {
  it('passes primitives through untouched', () => {
    expect(normalizeValue('hello')).toBe('hello')
    expect(normalizeValue(42)).toBe(42)
    expect(normalizeValue(4.5)).toBe(4.5)
    expect(normalizeValue(true)).toBe(true)
    expect(normalizeValue(false)).toBe(false)
  })

  it('maps null and undefined to null', () => {
    expect(normalizeValue(null)).toBeNull()
    expect(normalizeValue(undefined)).toBeNull()
  })

  it('serializes Dates to ISO strings', () => {
    const d = new Date('2026-07-02T10:30:00.000Z')
    expect(normalizeValue(d)).toBe('2026-07-02T10:30:00.000Z')
  })

  it('maps invalid Dates to null', () => {
    expect(normalizeValue(new Date('not a date'))).toBeNull()
  })

  it('serializes bigints to strings', () => {
    expect(normalizeValue(BigInt('9007199254740993'))).toBe('9007199254740993')
  })

  it('keeps non-finite numbers distinguishable from SQL NULL', () => {
    expect(normalizeValue(NaN)).toBe('NaN')
    expect(normalizeValue(Infinity)).toBe('Infinity')
    expect(normalizeValue(-Infinity)).toBe('-Infinity')
  })

  it('renders small binary values as full hex', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(normalizeValue(bytes)).toBe('\\xdeadbeef')
  })

  it('caps large binary values with a byte-count suffix', () => {
    const bytes = new Uint8Array(300).fill(0xab)
    const result = normalizeValue(bytes) as string
    expect(result.startsWith('\\x')).toBe(true)
    expect(result).toContain('(300 bytes)')
    // 2 hex chars per byte, 256-byte preview
    expect(result.slice(2, 2 + 512)).toBe('ab'.repeat(256))
  })

  it('leaves parsed JSON objects and arrays alone', () => {
    const obj = { a: 1, nested: { b: [1, 2] } }
    expect(normalizeValue(obj)).toBe(obj)
  })

  it('is idempotent — normalizing a normalized value is a no-op', () => {
    const once = normalizeValue(new Date('2026-01-01T00:00:00Z'))
    expect(normalizeValue(once)).toBe(once)
  })
})

describe('toColumnarRows', () => {
  const rows = [
    { id: 1, email: 'a@b.test', created_at: new Date('2026-06-01T00:00:00Z') },
    { id: 2, email: 'c@d.test', created_at: null }
  ]
  const columns = ['id', 'email', 'created_at']

  it('produces columnar arrays in column order', () => {
    const out = toColumnarRows(rows, columns, new Set())
    expect(out).toEqual([
      [1, 'a@b.test', '2026-06-01T00:00:00.000Z'],
      [2, 'c@d.test', null]
    ])
  })

  it('redacts masked columns with the export placeholder', () => {
    const out = toColumnarRows(rows, columns, new Set(['email']))
    expect(out[0][1]).toBe('[MASKED]')
    expect(out[1][1]).toBe('[MASKED]')
    expect(out[0][0]).toBe(1)
  })

  it('fills missing keys with null', () => {
    const out = toColumnarRows([{ id: 1 }], columns, new Set())
    expect(out).toEqual([[1, null, null]])
  })
})

describe('recordsFromColumnar', () => {
  it('round-trips with toColumnarRows', () => {
    const rows = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' }
    ]
    const columns = [
      { name: 'id', dataType: 'int4' },
      { name: 'name', dataType: 'text' }
    ]
    const columnar = toColumnarRows(rows, ['id', 'name'], new Set())
    expect(recordsFromColumnar(columns, columnar)).toEqual(rows)
  })

  it('handles empty row sets', () => {
    expect(recordsFromColumnar([{ name: 'id', dataType: 'int4' }], [])).toEqual([])
  })
})
