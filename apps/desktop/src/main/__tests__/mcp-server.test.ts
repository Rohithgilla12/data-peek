import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('../schema-cache', () => ({
  getCachedSchema: vi.fn(),
  isCacheValid: vi.fn(),
  getOrFetchCachedSchema: vi.fn()
}))
vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' } }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}))

import { McpService } from '../mcp/server'
import { ApprovalManager } from '../mcp/approval'

const TOKEN = 'test-token'
const PORT = 47221

function service(): McpService {
  return new McpService({
    getConnections: () => [],
    approval: new ApprovalManager(() => undefined)
  })
}

let svc: McpService
afterEach(async () => {
  await svc?.stop()
})

describe('McpService', () => {
  it('rejects requests without a valid bearer token', async () => {
    svc = service()
    await svc.start(PORT, TOKEN)
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(res.status).toBe(401)
    const bad = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
      body: '{}'
    })
    expect(bad.status).toBe(401)
  })

  it('answers an MCP initialize request with a valid token', async () => {
    svc = service()
    await svc.start(PORT, TOKEN)
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' }
        }
      })
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('data-peek')
  })

  it('returns 404 for other paths', async () => {
    svc = service()
    await svc.start(PORT, TOKEN)
    const res = await fetch(`http://127.0.0.1:${PORT}/other`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` }
    })
    expect(res.status).toBe(404)
  })

  it('rejects start when the port is in use, and stop is idempotent', async () => {
    svc = service()
    await svc.start(PORT, TOKEN)
    const second = service()
    await expect(second.start(PORT, TOKEN)).rejects.toThrow()
    await svc.stop()
    await svc.stop()
    expect(svc.running).toBe(false)
  })
})
