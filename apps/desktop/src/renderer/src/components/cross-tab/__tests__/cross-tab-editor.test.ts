import { describe, it, expect } from 'vitest'
import { atTokenBeforeCursor, filterRefs } from '../cross-tab-editor'
import type { CrossTabRef } from '@/lib/cross-tab-integration'

describe('atTokenBeforeCursor', () => {
  it('detects an @-token being typed at a word boundary', () => {
    expect(atTokenBeforeCursor('SELECT * FROM @act')).toEqual({ active: true, partial: 'act' })
  })
  it('detects a bare @ with empty partial', () => {
    expect(atTokenBeforeCursor('SELECT * FROM @')).toEqual({ active: true, partial: '' })
  })
  it('ignores @@ (system variable)', () => {
    expect(atTokenBeforeCursor('SELECT @@ver').active).toBe(false)
  })
  it('ignores email-like sequences', () => {
    expect(atTokenBeforeCursor("'a@x").active).toBe(false)
  })
  it('is inactive when there is no trailing @-token', () => {
    expect(atTokenBeforeCursor('SELECT * FROM users').active).toBe(false)
  })
})

describe('filterRefs', () => {
  const refs: CrossTabRef[] = [
    { name: 'active_users', tabTitle: 'A', result: { kind: 'ready', rowCount: 1, colCount: 1 } },
    { name: 'archived', tabTitle: 'B', result: { kind: 'ready', rowCount: 1, colCount: 1 } },
    { name: 'pending', tabTitle: 'C', result: { kind: 'not_run' } }
  ]
  it('returns all refs for an empty partial', () => {
    expect(filterRefs(refs, '')).toHaveLength(3)
  })
  it('prefix-filters by name', () => {
    expect(filterRefs(refs, 'a').map((r) => r.name)).toEqual(['active_users', 'archived'])
  })
})
