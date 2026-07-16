import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, (event: unknown, args: unknown) => unknown>()
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: never) => handlers.set(channel, fn)) },
  app: { getVersion: () => '0.0.0' }
}))
vi.mock('../window-manager', () => ({ windowManager: { broadcastToAll: vi.fn() } }))

import { registerMcpHandlers, type McpSettings } from '../ipc/mcp-handlers'

function makeStore(initial: McpSettings) {
  let value = initial
  return {
    get: vi.fn(() => value),
    set: vi.fn((_k: string, v: McpSettings) => {
      value = v
    })
  } as never
}

function makeService() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    running: false,
    approval: { respond: vi.fn() }
  }
}

const invoke = (channel: string, args?: unknown) => handlers.get(channel)!({}, args)

describe('mcp handlers', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
  })

  it('mcp:status returns persisted settings without starting the server', async () => {
    const svc = makeService()
    registerMcpHandlers(makeStore({ enabled: false, port: 4722, token: 'tok' }), svc as never)
    const res = (await invoke('mcp:status')) as { success: boolean; data: { port: number } }
    expect(res.success).toBe(true)
    expect(res.data.port).toBe(4722)
    expect(svc.start).not.toHaveBeenCalled()
  })

  it('mcp:setEnabled true starts the server and persists', async () => {
    const svc = makeService()
    const store = makeStore({ enabled: false, port: 4722, token: 'tok' })
    registerMcpHandlers(store, svc as never)
    const res = (await invoke('mcp:setEnabled', { enabled: true })) as { success: boolean }
    expect(res.success).toBe(true)
    expect(svc.start).toHaveBeenCalledWith(4722, 'tok')
  })

  it('mcp:setEnabled surfaces start errors (port busy) and keeps enabled=false', async () => {
    const svc = makeService()
    svc.start.mockRejectedValue(new Error('EADDRINUSE'))
    const store = makeStore({ enabled: false, port: 4722, token: 'tok' })
    registerMcpHandlers(store, svc as never)
    const res = (await invoke('mcp:setEnabled', { enabled: true })) as {
      success: boolean
      error?: string
    }
    expect(res.success).toBe(false)
    expect(res.error).toContain('EADDRINUSE')
  })

  it('mcp:regenerateToken produces a new 64-char hex token', async () => {
    const store = makeStore({ enabled: false, port: 4722, token: 'old' })
    registerMcpHandlers(store, makeService() as never)
    const res = (await invoke('mcp:regenerateToken')) as { data: { token: string } }
    expect(res.data.token).toMatch(/^[0-9a-f]{64}$/)
    expect(res.data.token).not.toBe('old')
  })
})
