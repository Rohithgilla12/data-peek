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
  }
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
    registerMcpHandlers(
      makeStore({ enabled: false, port: 4722, token: 'tok' }) as never,
      svc as never
    )
    const res = (await invoke('mcp:status')) as { success: boolean; data: { port: number } }
    expect(res.success).toBe(true)
    expect(res.data.port).toBe(4722)
    expect(svc.start).not.toHaveBeenCalled()
  })

  it('mcp:setEnabled true starts the server and persists', async () => {
    const svc = makeService()
    const store = makeStore({ enabled: false, port: 4722, token: 'tok' })
    registerMcpHandlers(store as never, svc as never)
    const res = (await invoke('mcp:setEnabled', { enabled: true })) as { success: boolean }
    expect(res.success).toBe(true)
    expect(svc.start).toHaveBeenCalledWith(4722, 'tok')
  })

  it('mcp:setEnabled surfaces start errors (port busy) and keeps enabled=false', async () => {
    const svc = makeService()
    svc.start.mockRejectedValue(new Error('EADDRINUSE'))
    const store = makeStore({ enabled: false, port: 4722, token: 'tok' })
    registerMcpHandlers(store as never, svc as never)
    const res = (await invoke('mcp:setEnabled', { enabled: true })) as {
      success: boolean
      error?: string
    }
    expect(res.success).toBe(false)
    expect(res.error).toContain('EADDRINUSE')
  })

  it('mcp:regenerateToken produces a new 64-char hex token', async () => {
    const store = makeStore({ enabled: false, port: 4722, token: 'old' })
    registerMcpHandlers(store as never, makeService() as never)
    const res = (await invoke('mcp:regenerateToken')) as { data: { token: string } }
    expect(res.data.token).toMatch(/^[0-9a-f]{64}$/)
    expect(res.data.token).not.toBe('old')
  })

  it('mcp:setPort while running: new port start fails, keeps old port and restarts old', async () => {
    const svc = makeService()
    svc.running = true
    svc.start.mockRejectedValueOnce(new Error('EADDRINUSE')).mockResolvedValueOnce(undefined)
    const store = makeStore({ enabled: true, port: 4722, token: 'tok' })
    registerMcpHandlers(store as never, svc as never)
    const res = (await invoke('mcp:setPort', { port: 5000 })) as {
      success: boolean
      error?: string
    }
    expect(res.success).toBe(false)
    expect(res.error).toContain('EADDRINUSE')
    expect(store.set).not.toHaveBeenCalled()
    expect(svc.start).toHaveBeenNthCalledWith(1, 5000, 'tok')
    expect(svc.start).toHaveBeenNthCalledWith(2, 4722, 'tok')
  })

  it('mcp:regenerateToken while running: start fails, keeps old token and surfaces error', async () => {
    const svc = makeService()
    svc.running = true
    svc.start.mockRejectedValue(new Error('start failed'))
    const store = makeStore({ enabled: true, port: 4722, token: 'old' })
    registerMcpHandlers(store as never, svc as never)
    const res = (await invoke('mcp:regenerateToken')) as { success: boolean; error?: string }
    expect(res.success).toBe(false)
    expect(res.error).toContain('start failed')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('mcp:setPort while running succeeds: persists new port and starts with it', async () => {
    const svc = makeService()
    svc.running = true
    const store = makeStore({ enabled: true, port: 4722, token: 'tok' })
    registerMcpHandlers(store as never, svc as never)
    const res = (await invoke('mcp:setPort', { port: 5000 })) as {
      success: boolean
      data: { port: number }
    }
    expect(res.success).toBe(true)
    expect(res.data.port).toBe(5000)
    expect(svc.start).toHaveBeenCalledWith(5000, 'tok')
    expect(store.set).toHaveBeenCalledWith('mcpSettings', {
      enabled: true,
      port: 5000,
      token: 'tok'
    })
  })
})
