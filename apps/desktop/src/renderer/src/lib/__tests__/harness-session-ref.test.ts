import { describe, it, expect } from 'vitest'
import { resolveHarnessResumeId } from '../harness-session-ref'

describe('resolveHarnessResumeId', () => {
  it('resumes when the active provider matches the one that produced the session id', () => {
    const ref = { provider: 'claude-cli' as const, sessionId: 'claude-uuid-1' }
    expect(resolveHarnessResumeId(ref, 'claude-cli')).toBe('claude-uuid-1')
  })

  it('drops the session id when the active provider switched away', () => {
    const ref = { provider: 'claude-cli' as const, sessionId: 'claude-uuid-1' }
    expect(resolveHarnessResumeId(ref, 'codex-cli')).toBeUndefined()
  })

  it('drops the session id when switching back to a third, unrelated provider', () => {
    const ref = { provider: 'codex-cli' as const, sessionId: 'codex-thread-1' }
    expect(resolveHarnessResumeId(ref, 'anthropic')).toBeUndefined()
  })

  it('returns undefined when there is no stored ref yet', () => {
    expect(resolveHarnessResumeId(undefined, 'claude-cli')).toBeUndefined()
  })

  it('returns undefined when the active provider is unknown', () => {
    const ref = { provider: 'claude-cli' as const, sessionId: 'claude-uuid-1' }
    expect(resolveHarnessResumeId(ref, undefined)).toBeUndefined()
  })
})
