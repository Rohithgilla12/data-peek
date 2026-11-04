import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))

const calls: string[] = []
vi.mock('mssql', () => {
  class Transaction {
    async begin(): Promise<void> {
      calls.push('begin')
    }
    async commit(): Promise<void> {
      calls.push('commit')
    }
    async rollback(): Promise<void> {
      calls.push('rollback')
    }
  }
  class ConnectionPool {
    on(): this {
      return this
    }
    async connect(): Promise<this> {
      return this
    }
    async close(): Promise<void> {
      calls.push('close')
    }
  }
  return { default: { Transaction, ConnectionPool }, Transaction, ConnectionPool }
})

import { withMSSQLRolledBackTransaction } from '../adapters/mssql-pool-manager'

const config = {
  id: 'rb',
  name: 'rb',
  dbType: 'mssql',
  host: 'localhost',
  port: 1433,
  database: 'db',
  user: 'u',
  password: 'p'
} as unknown as ConnectionConfig

beforeEach(() => {
  calls.length = 0
})

describe('withMSSQLRolledBackTransaction', () => {
  it('rolls back, never commits, after fn succeeds', async () => {
    await expect(withMSSQLRolledBackTransaction(config, async () => 'ok')).resolves.toBe('ok')
    expect(calls).toEqual(['begin', 'rollback'])
  })

  it('rolls back when fn throws', async () => {
    await expect(
      withMSSQLRolledBackTransaction(config, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(calls).toEqual(['begin', 'rollback'])
  })
})
