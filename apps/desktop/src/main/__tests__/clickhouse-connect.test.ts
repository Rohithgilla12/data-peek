import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const hangingQuery = vi.fn((params: { abort_signal?: AbortSignal }) => {
  return new Promise((_resolve, reject) => {
    params.abort_signal?.addEventListener('abort', () =>
      reject(new Error('The user aborted a request.'))
    )
  })
})
const closePool = vi.fn(async () => undefined)

vi.mock('../adapters/clickhouse-pool-manager', () => ({
  withClickHouseClient: (_config: unknown, fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: hangingQuery }),
  closeClickHousePool: () => closePool(),
  closeAllClickHousePools: vi.fn()
}))

import { ClickHouseAdapter } from '../adapters/clickhouse-adapter'

const config: ConnectionConfig = {
  id: 'ch1',
  name: 'blackhole',
  host: '10.255.255.1',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
  dbType: 'clickhouse',
  dstPort: 8123
}

describe('ClickHouseAdapter.connect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hangingQuery.mockClear()
    closePool.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives up on an unresponsive server after 15 s with a timeout message', async () => {
    const outcome = new ClickHouseAdapter().connect(config).then(
      () => 'resolved',
      (error: Error) => error.message
    )
    const settled = (): Promise<string> => Promise.race([outcome, Promise.resolve('pending')])

    await vi.advanceTimersByTimeAsync(14_999)
    expect(await settled()).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(await settled()).toBe('Connection timed out after 15 s')
    expect(closePool).toHaveBeenCalledTimes(1)
  })
})

describe('ClickHouseAdapter.queryReadOnly', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hangingQuery.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out a response whose body never arrives, and aborts the request', async () => {
    let signal: AbortSignal | undefined
    hangingQuery.mockImplementationOnce(async (params) => {
      signal = params.abort_signal
      return { json: () => new Promise(() => undefined) }
    })
    const outcome = new ClickHouseAdapter()
      .queryReadOnly(config, 'SELECT 1', { timeoutMs: 30_000 })
      .then(
        () => 'resolved',
        (error: Error) => error.message
      )
    const settled = (): Promise<string> => Promise.race([outcome, Promise.resolve('pending')])

    await vi.advanceTimersByTimeAsync(34_999)
    expect(await settled()).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(await settled()).toBe('Query timed out after 30 s')
    expect(signal?.aborted).toBe(true)
  })
})
