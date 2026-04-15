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
  let mockClient: MockClient

  beforeEach(() => {
    mockClient = new MockClient()
    registry = new StepSessionRegistry({
      createClient: (() => mockClient) as never
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
      expect(mockClient.calls).toContain('BEGIN')
    })

    it('does not run BEGIN when inTransaction is false', async () => {
      await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      expect(mockClient.calls).not.toContain('BEGIN')
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
      mockClient.responses.push({ rows: [{ a: 1 }], rowCount: 1 })

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
      mockClient.responses.push({ rows: [], rowCount: 0 })

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
      mockClient.responses.push({ error: new Error('syntax error') })

      const response = await registry.next(sessionId)
      expect(response.state).toBe('errored')
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
      const callsBefore = mockClient.calls.length

      const response = await registry.skip(sessionId)
      expect(response.statementIndex).toBe(0)
      expect(response.state).toBe('paused')
      expect(mockClient.calls.length).toBe(callsBefore)
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
      mockClient.responses.push({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 3 })

      const response = await registry.continue(sessionId)
      expect(response.executedIndices).toEqual([0, 1, 2])
      expect(response.stoppedAt).toBe(-1)
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
      mockClient.responses.push({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 3 })

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
      mockClient.responses.push(
        { rowCount: 1 },
        { error: new Error('boom') }
      )

      const response = await registry.continue(sessionId)
      expect(response.executedIndices).toEqual([0])
      expect(response.state).toBe('errored')
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
      mockClient.responses.push({ error: new Error('boom') })
      await registry.next(sessionId)

      mockClient.responses.push({ rowCount: 1 })
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
      mockClient.responses.push({ error: new Error('boom') })
      await registry.next(sessionId)

      await expect(registry.retry(sessionId)).rejects.toThrow(/transaction mode/i)
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
      expect(mockClient.calls).toContain('ROLLBACK')
      expect(mockClient.ended).toBe(true)
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
      expect(mockClient.calls).not.toContain('ROLLBACK')
      expect(mockClient.ended).toBe(true)
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

  describe('cleanupWindow', () => {
    it('stops all sessions for a given window', async () => {
      const a = await registry.start({
        config: mockConfig,
        tabId: 'tab-1',
        windowId: 1,
        sql: 'SELECT 1;',
        inTransaction: false
      })
      // NOTE: each call to `start` creates a new session but all share the same
      // mockClient instance because our factory returns the same mock. That's
      // fine for this test — we just verify session existence, not client state.

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
      mockClient.responses.push({ rowCount: 1 })
      const result = await registry.next(c.sessionId)
      expect(result.state).toBe('done')
    })
  })
})
