import { describe, it, expect } from 'vitest'
import { types } from 'pg'
import { configurePgTypeParsers } from '../pg-type-parsers'

describe('configurePgTypeParsers', () => {
  it('returns timestamp / timestamptz / date as raw DB strings instead of JS Dates', () => {
    configurePgTypeParsers()

    const timestamp = types.getTypeParser(types.builtins.TIMESTAMP)
    const timestamptz = types.getTypeParser(types.builtins.TIMESTAMPTZ)
    const date = types.getTypeParser(types.builtins.DATE)

    // No JS Date reinterpretation: the value the database sent is the value we show.
    expect(timestamp('2026-01-02 09:08:00')).toBe('2026-01-02 09:08:00')
    expect(timestamptz('2026-01-02 09:08:00+00')).toBe('2026-01-02 09:08:00+00')
    expect(date('2026-01-02')).toBe('2026-01-02')

    expect(timestamp('2026-01-02 09:08:00')).not.toBeInstanceOf(Date)
  })
})
