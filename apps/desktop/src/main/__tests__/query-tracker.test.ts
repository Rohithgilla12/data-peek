import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { registerQuery, cancelQuery } from '../query-tracker'

describe('cancelQuery — postgres handle branches', () => {
  it('calls release(true) when the handle is a PoolClient', async () => {
    const release = vi.fn()
    registerQuery('pool-exec', {
      type: 'postgresql',
      client: { release } as never
    })

    const result = await cancelQuery('pool-exec')

    expect(release).toHaveBeenCalledWith(true)
    expect(result.cancelled).toBe(true)
  })

  it('falls back to end() when the handle is a bare Client', async () => {
    const end = vi.fn().mockResolvedValue(undefined)
    registerQuery('client-exec', {
      type: 'postgresql',
      client: { end } as never
    })

    const result = await cancelQuery('client-exec')

    expect(end).toHaveBeenCalled()
    expect(result.cancelled).toBe(true)
  })

  it('returns an error rather than silently no-opping when the handle has neither method', async () => {
    registerQuery('broken-exec', {
      type: 'postgresql',
      client: {} as never
    })

    const result = await cancelQuery('broken-exec')

    expect(result.cancelled).toBe(false)
    expect(result.error).toMatch(/neither release nor end/i)
  })
})
