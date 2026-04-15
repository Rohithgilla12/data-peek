import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    transports: {
      console: { level: 'debug' },
      file: { level: 'debug', maxSize: 0, format: '' }
    },
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

import { StepSessionRegistry } from '../step-session'
import type { ConnectionConfig } from '@shared/index'

class MockClient {
  calls: string[] = []
  responses: Array<{ rows?: unknown[]; fields?: unknown[]; rowCount?: number; error?: Error }> = []
  ended = false

  async connect() {}
  async query(sql: string) {
    this.calls.push(sql)
    const response = this.responses.shift()
    if (!response) return { rows: [], fields: [], rowCount: 0 }
    if (response.error) throw response.error
    return {
      rows: response.rows ?? [],
      fields: response.fields ?? [],
      rowCount: response.rowCount ?? 0
    }
  }
  async end() { this.ended = true }
}

const mockConfig: ConnectionConfig = {
  id: 'test',
  name: 'test',
  dbType: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'test',
  user: 'test',
  password: 'test'
} as ConnectionConfig

describe('StepSessionRegistry', () => {
  let registry: StepSessionRegistry
  let mockClients: MockClient[]

  beforeEach(() => {
    mockClients = []
    registry = new StepSessionRegistry({
      createClient: (() => {
        const client = new MockClient()
        mockClients.push(client)
        return client
      }) as never
    })
  })

  describe('start', () => {
    it('creates a session with parsed statements', async () => {
      const { sessionId, statements } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2;',
        inTransaction: false
      })
      expect(sessionId).toBeTruthy()
      expect(statements).toHaveLength(2)
    })

    it('runs BEGIN when inTransaction is true', async () => {
      await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: true
      })
      expect(mockClients[0].calls).toContain('BEGIN')
    })

    it('does not run BEGIN when inTransaction is false', async () => {
      await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      expect(mockClients[0].calls).not.toContain('BEGIN')
    })
  })

  describe('start error handling', () => {
    it('rejects and cleans up client when connect fails', async () => {
      const failingRegistry = new StepSessionRegistry({
        createClient: (() => {
          const c = new MockClient()
          c.connect = async () => { throw new Error('connection refused') }
          mockClients.push(c)
          return c
        }) as never
      })
      await expect(
        failingRegistry.start({
          config: mockConfig,
          tabId: 'tab-1',
          windowId: 1,
          sql: 'SELECT 1',
          inTransaction: false
        })
      ).rejects.toThrow('connection refused')
      expect(mockClients[0].ended).toBe(true)
    })

    it('rejects and cleans up client when BEGIN fails in transaction mode', async () => {
      const failingRegistry = new StepSessionRegistry({
        createClient: (() => {
          const c = new MockClient()
          c.responses.push({ error: new Error('permission denied for BEGIN') })
          mockClients.push(c)
          return c
        }) as never
      })
      await expect(
        failingRegistry.start({
          config: mockConfig,
          tabId: 'tab-1',
          windowId: 1,
          sql: 'SELECT 1',
          inTransaction: true
        })
      ).rejects.toThrow('permission denied')
      expect(mockClients[0].ended).toBe(true)
    })

    it('rejects on empty SQL without creating a client', async () => {
      const capturedClients: MockClient[] = []
      const emptyRegistry = new StepSessionRegistry({
        createClient: (() => {
          const c = new MockClient()
          capturedClients.push(c)
          return c
        }) as never
      })
      await expect(
        emptyRegistry.start({
          config: mockConfig,
          tabId: 'tab-1',
          windowId: 1,
          sql: '',
          inTransaction: false
        })
      ).rejects.toThrow(/no statements/i)
      expect(capturedClients).toHaveLength(0)
    })

    it('rejects on whitespace-only SQL without creating a client', async () => {
      const capturedClients: MockClient[] = []
      const wsRegistry = new StepSessionRegistry({
        createClient: (() => {
          const c = new MockClient()
          capturedClients.push(c)
          return c
        }) as never
      })
      await expect(
        wsRegistry.start({
          config: mockConfig,
          tabId: 'tab-1',
          windowId: 1,
          sql: '   \n\n-- only comment\n',
          inTransaction: false
        })
      ).rejects.toThrow(/no statements/i)
      expect(capturedClients).toHaveLength(0)
    })
  })

  describe('next', () => {
    it('executes the next statement and increments cursor', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2;',
        inTransaction: false
      })
      mockClients[0].responses.push({ rows: [{ a: 1 }], rowCount: 1 })

      const response = await registry.next(sessionId)
      expect(response.statementIndex).toBe(0)
      expect(response.result.rowCount).toBe(1)
      expect(response.state).toBe('paused')
      expect(response.cursorIndex).toBe(1)
    })

    it('transitions to done after last statement', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      mockClients[0].responses.push({ rows: [], rowCount: 0 })

      const response = await registry.next(sessionId)
      expect(response.state).toBe('done')
    })

    it('transitions to errored on query failure', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      mockClients[0].responses.push({ error: new Error('syntax error') })

      const response = await registry.next(sessionId)
      expect(response.state).toBe('errored')
    })
  })

  describe('concurrent operations', () => {
    it('double-click on Next does not double-execute', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2;',
        inTransaction: false
      })

      // Push only ONE response — if both Next calls execute, the second
      // will get an empty response (fallback in MockClient) and we'll see
      // TWO queries run against mockClients[0]
      mockClients[0].responses.push({ rowCount: 1 })

      const callsBefore = mockClients[0].calls.length

      // Fire two next() concurrently without awaiting the first
      const [r1, r2] = await Promise.allSettled([
        registry.next(sessionId),
        registry.next(sessionId)
      ])

      // Exactly one should succeed; the other should reject because
      // state !== 'paused' once the first is running
      const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled')
      const rejected = [r1, r2].filter((r) => r.status === 'rejected')

      // If this test fails because both succeed, that's a real bug.
      // Expected behavior: one succeeds, one rejects.
      expect(succeeded).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      // Only one statement actually executed:
      const newCalls = mockClients[0].calls.length - callsBefore
      expect(newCalls).toBe(1)
    })
  })

  describe('skip', () => {
    it('increments cursor without executing', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2;',
        inTransaction: false
      })
      const callsBefore = mockClients[0].calls.length

      const response = await registry.skip(sessionId)
      expect(response.statementIndex).toBe(0)
      expect(response.state).toBe('paused')
      expect(mockClients[0].calls.length).toBe(callsBefore)
    })

    it('skip on the last statement transitions to done', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1',
        inTransaction: false
      })
      const response = await registry.skip(sessionId)
      expect(response.state).toBe('done')
    })
  })

  describe('continue', () => {
    it('runs all remaining statements when no breakpoints', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2; SELECT 3;',
        inTransaction: false
      })
      mockClients[0].responses.push({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 3 })

      const response = await registry.continue(sessionId)
      expect(response.executedIndices).toEqual([0, 1, 2])
      expect(response.stoppedAt).toBe(null)
      expect(response.state).toBe('done')
    })

    it('stops at breakpoint', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2; SELECT 3;',
        inTransaction: false
      })
      await registry.setBreakpoints(sessionId, [2])
      mockClients[0].responses.push({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 3 })

      const response = await registry.continue(sessionId)
      expect(response.executedIndices).toEqual([0, 1])
      expect(response.stoppedAt).toBe(2)
      expect(response.state).toBe('paused')
    })

    it('stops on error', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2; SELECT 3;',
        inTransaction: false
      })
      mockClients[0].responses.push(
        { rowCount: 1 },
        { error: new Error('boom') }
      )

      const response = await registry.continue(sessionId)
      expect(response.executedIndices).toEqual([0, 1])
      expect(response.state).toBe('errored')
      expect(response.error).toEqual({ statementIndex: 1, message: 'boom' })
    })
  })

  describe('continue with breakpoint at cursor', () => {
    it('does not stop on breakpoint at current cursor position (first iteration)', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2; SELECT 3;',
        inTransaction: false
      })
      // Breakpoint at cursor 0 — continue() should still run statement 0
      await registry.setBreakpoints(sessionId, [0])
      mockClients[0].responses.push({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 3 })

      const response = await registry.continue(sessionId)

      // First statement runs even though cursor started on a breakpoint
      expect(response.executedIndices).toContain(0)
    })

    it('stops at breakpoint after advancing past current cursor', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1; SELECT 2; SELECT 3;',
        inTransaction: false
      })
      await registry.setBreakpoints(sessionId, [1])
      mockClients[0].responses.push({ rowCount: 1 }, { rowCount: 2 })

      const response = await registry.continue(sessionId)

      expect(response.executedIndices).toEqual([0])
      expect(response.stoppedAt).toBe(1)
      expect(response.state).toBe('paused')
    })
  })

  describe('retry', () => {
    it('re-executes current statement in auto-commit mode', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      mockClients[0].responses.push({ error: new Error('boom') })
      await registry.next(sessionId)

      mockClients[0].responses.push({ rowCount: 1 })
      const response = await registry.retry(sessionId)
      expect(response.result.rowCount).toBe(1)
      expect(response.state).toBe('done')
    })

    it('rejects retry when in transaction mode', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: true
      })
      mockClients[0].responses.push({ error: new Error('boom') })
      await registry.next(sessionId)

      await expect(registry.retry(sessionId)).rejects.toThrow(/transaction mode/i)
    })
  })

  describe('retry state guard', () => {
    it('throws when state is paused', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1',
        inTransaction: false
      })
      await expect(registry.retry(sessionId)).rejects.toThrow(/errored state/i)
    })

    it('throws when state is done', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1',
        inTransaction: false
      })
      mockClients[0].responses.push({ rowCount: 1 })
      await registry.next(sessionId)
      // Now state is 'done'
      await expect(registry.retry(sessionId)).rejects.toThrow(/errored state/i)
    })
  })

  describe('stop', () => {
    it('rolls back transaction and closes client in transaction mode', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: true
      })
      const response = await registry.stop(sessionId)
      expect(response.rolledBack).toBe(true)
      expect(mockClients[0].calls).toContain('ROLLBACK')
      expect(mockClients[0].ended).toBe(true)
    })

    it('just closes client in auto-commit mode', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      const response = await registry.stop(sessionId)
      expect(response.rolledBack).toBe(false)
      expect(mockClients[0].calls).not.toContain('ROLLBACK')
      expect(mockClients[0].ended).toBe(true)
    })

    it('removes session from registry', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      await registry.stop(sessionId)
      await expect(registry.next(sessionId)).rejects.toThrow(/not found/i)
    })
  })

  describe('stop idempotency', () => {
    it('second stop() returns rolledBack: false without throwing', async () => {
      const { sessionId } = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1',
        inTransaction: false
      })
      await registry.stop(sessionId)
      const result = await registry.stop(sessionId)
      expect(result.rolledBack).toBe(false)
    })
  })

  describe('cleanupWindow', () => {
    it('stops all sessions for a given window', async () => {
      const a = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      // NOTE: each call to `start` creates a new session with its own MockClient
      // because our factory creates a fresh one each time.

      const b = await registry.start({
        config: mockConfig,
        tabId: 'tab-2',
        windowId: 1,
        sql: 'SELECT 2;',
        inTransaction: false
      })
      const c = await registry.start({
        config: mockConfig,
        tabId: 'tab-3',
        windowId: 2,
        sql: 'SELECT 3;',
        inTransaction: false
      })

      await registry.cleanupWindow(1)

      await expect(registry.next(a.sessionId)).rejects.toThrow(/not found/i)
      await expect(registry.next(b.sessionId)).rejects.toThrow(/not found/i)
      mockClients[2].responses.push({ rowCount: 1 })
      const result = await registry.next(c.sessionId)
      expect(result.state).toBe('done')
    })
  })
})
