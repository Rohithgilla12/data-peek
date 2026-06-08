import { describe, it, expect, vi } from 'vitest'

// scheduler-service pulls in electron (Notification), the storage facade, the db
// adapter, and the logger at module load; none are needed for the pure cron helpers.
vi.mock('electron', () => ({ Notification: class {} }))
vi.mock('../storage', () => ({ DpStorage: { create: vi.fn() } }))
vi.mock('../db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { validateCronExpression, getNextRunTimes } from '../scheduler-service'

describe('validateCronExpression', () => {
  it('accepts a valid hourly expression', () => {
    expect(validateCronExpression('0 * * * *')).toEqual({ valid: true })
  })

  it('accepts an every-minute expression', () => {
    expect(validateCronExpression('* * * * *').valid).toBe(true)
  })

  it('rejects a malformed expression with a non-empty error message', () => {
    const result = validateCronExpression('not a cron')
    expect(result.valid).toBe(false)
    expect(result.error && result.error.length).toBeGreaterThan(0)
  })

  it('rejects an out-of-range field', () => {
    expect(validateCronExpression('99 * * * *').valid).toBe(false)
  })
})

describe('getNextRunTimes', () => {
  it('returns the requested number of strictly increasing future timestamps', () => {
    const times = getNextRunTimes('0 * * * *', 3)
    expect(times).toHaveLength(3)
    expect(times[0]).toBeLessThan(times[1])
    expect(times[1]).toBeLessThan(times[2])
  })

  it('defaults to five upcoming run times', () => {
    expect(getNextRunTimes('0 0 * * *')).toHaveLength(5)
  })

  it('returns an empty array for an unparseable expression', () => {
    expect(getNextRunTimes('not a cron')).toEqual([])
  })
})
