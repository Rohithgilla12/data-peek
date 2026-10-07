import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { registerQuery, cancelQuery, isQueryActive } from '../query-tracker'

describe('cancelQuery with a ClickHouse handle', () => {
  it('awaits the handle cancel and drops the query from tracking', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    registerQuery('ch-exec', { type: 'clickhouse', cancel })

    const result = await cancelQuery('ch-exec')

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ cancelled: true })
    expect(isQueryActive('ch-exec')).toBe(false)
  })

  it('reports a failed KILL QUERY instead of claiming success', async () => {
    registerQuery('ch-bad', {
      type: 'clickhouse',
      cancel: vi.fn().mockRejectedValue(new Error('kill failed'))
    })

    const result = await cancelQuery('ch-bad')

    expect(result).toEqual({ cancelled: false, error: 'kill failed' })
    expect(isQueryActive('ch-bad')).toBe(false)
  })

  it('refuses an unknown handle type rather than silently cancelling nothing', async () => {
    registerQuery('unknown-exec', { type: 'duckdb' } as never)

    const result = await cancelQuery('unknown-exec')

    expect(result.cancelled).toBe(false)
    expect(result.error).toMatch(/Unhandled cancellable handle/)
  })
})
