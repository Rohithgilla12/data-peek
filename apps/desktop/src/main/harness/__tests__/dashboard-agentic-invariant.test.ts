import { describe, it, expect, vi } from 'vitest'

// service.ts pulls in lib/logger (electron-log) at import — stub it.
vi.mock('../../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

// Neither real adapter is dashboard-capable-but-not-agentic (claude-cli is
// both, codex-cli is neither), so the codex regression in service.test.ts
// never exercises the `!capabilities.agentic` branch on its own. Stub the
// claude-cli adapter with that hypothetical shape to prove the invariant
// holds regardless of which adapter combination shows up next.
vi.mock('../adapters/claude-code', () => ({
  claudeCodeAdapter: {
    id: 'claude-cli',
    cliLabel: 'Claude CLI',
    notFoundMessage: 'not found',
    capabilities: { streaming: true, resume: true, dashboard: true, agentic: false },
    detect: vi.fn(),
    buildRequest: vi.fn(),
    createRun: vi.fn()
  }
}))

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))

import { generateDashboardViaHarness } from '../service'

describe('generateDashboardViaHarness dashboard/agentic invariant', () => {
  it('refuses a dashboard-capable adapter that cannot ground itself agentically', async () => {
    const res = await generateDashboardViaHarness(
      'claude-cli',
      'overview',
      [],
      'postgresql',
      'conn-1'
    )
    expect(res).toEqual({
      success: false,
      error: 'Dashboard generation is not supported by this harness yet.'
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
