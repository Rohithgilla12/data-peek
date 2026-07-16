import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalManager } from '../mcp/approval'
import type { McpApprovalRequest } from '@shared/index'

describe('ApprovalManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves true when approved', async () => {
    const sent: McpApprovalRequest[] = []
    const mgr = new ApprovalManager((req) => sent.push(req))
    const p = mgr.request('local', 'UPDATE t SET x = 1')
    expect(sent).toHaveLength(1)
    mgr.respond(sent[0].id, true)
    await expect(p).resolves.toBe(true)
  })

  it('resolves false when rejected', async () => {
    const sent: McpApprovalRequest[] = []
    const mgr = new ApprovalManager((req) => sent.push(req))
    const p = mgr.request('local', 'DROP TABLE t')
    mgr.respond(sent[0].id, false)
    await expect(p).resolves.toBe(false)
  })

  it('auto-rejects after the timeout', async () => {
    const mgr = new ApprovalManager(() => undefined, 60_000)
    const p = mgr.request('local', 'DELETE FROM t')
    vi.advanceTimersByTime(60_001)
    await expect(p).resolves.toBe(false)
  })

  it('serializes concurrent requests', async () => {
    const sent: McpApprovalRequest[] = []
    const mgr = new ApprovalManager((req) => sent.push(req))
    const p1 = mgr.request('a', 'UPDATE a SET x=1')
    const p2 = mgr.request('b', 'UPDATE b SET x=1')
    expect(sent).toHaveLength(1) // second waits for first
    mgr.respond(sent[0].id, true)
    await expect(p1).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(2)
    mgr.respond(sent[1].id, false)
    await expect(p2).resolves.toBe(false)
  })

  it('ignores responses for unknown ids', () => {
    const mgr = new ApprovalManager(() => undefined)
    expect(() => mgr.respond('nope', true)).not.toThrow()
  })

  it('calls onResolved with the id on explicit respond', async () => {
    const sent: McpApprovalRequest[] = []
    const resolved: string[] = []
    const mgr = new ApprovalManager(
      (req) => sent.push(req),
      60_000,
      (id) => resolved.push(id)
    )
    const p = mgr.request('local', 'UPDATE t SET x = 1')
    mgr.respond(sent[0].id, true)
    await expect(p).resolves.toBe(true)
    expect(resolved).toEqual([sent[0].id])
  })

  it('calls onResolved with the id on timeout', async () => {
    const sent: McpApprovalRequest[] = []
    const resolved: string[] = []
    const mgr = new ApprovalManager(
      (req) => sent.push(req),
      60_000,
      (id) => resolved.push(id)
    )
    const p = mgr.request('local', 'DELETE FROM t')
    vi.advanceTimersByTime(60_001)
    await expect(p).resolves.toBe(false)
    expect(resolved).toEqual([sent[0].id])
  })
})
