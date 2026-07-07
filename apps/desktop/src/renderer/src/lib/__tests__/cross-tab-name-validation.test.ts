import { describe, it, expect } from 'vitest'
import { validateRefName, isReservedRefName } from '../cross-tab-name-validation'
import { REF_NAME_MAX_LENGTH } from '../cross-tab-types'

describe('validateRefName', () => {
  describe('shape', () => {
    it('accepts a basic lowercase identifier', () => {
      const r = validateRefName('active_users')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.normalized).toBe('active_users')
    })

    it('lowercases the input (silently normalizes mixed case)', () => {
      const r = validateRefName('ActiveUsers')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.normalized).toBe('activeusers')
    })

    it('normalizes pure-uppercase to lowercase', () => {
      const r = validateRefName('USERS')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.normalized).toBe('users')
    })

    it('rejects empty after trim', () => {
      const r = validateRefName('   ')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('empty')
    })

    it('rejects too long', () => {
      const long = 'a' + 'x'.repeat(REF_NAME_MAX_LENGTH)
      const r = validateRefName(long)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('too_long')
    })

    it('rejects starting with a digit', () => {
      const r = validateRefName('1users')
      expect(r.ok).toBe(false)
    })

    it('rejects with hyphens', () => {
      const r = validateRefName('active-users')
      expect(r.ok).toBe(false)
    })

    it('rejects with spaces', () => {
      const r = validateRefName('active users')
      expect(r.ok).toBe(false)
    })

    it('accepts digits + underscores after first letter', () => {
      const r = validateRefName('users_v2')
      expect(r.ok).toBe(true)
    })
  })

  describe('reserved words', () => {
    it('rejects SELECT', () => {
      const r = validateRefName('select')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('reserved_word')
    })

    it('rejects WITH', () => {
      const r = validateRefName('with')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('reserved_word')
    })

    it('isReservedRefName helper works case-insensitively', () => {
      expect(isReservedRefName('SELECT')).toBe(true)
      expect(isReservedRefName('users')).toBe(false)
    })

    it('rejects the broader shared SQL keyword set (table / into / set / over)', () => {
      // Not in the local RESERVED_REF_NAMES list but caught by the shared
      // isSQLKeyword check. Bug fix from PR #184 review — these would
      // otherwise pass validation and only fail at resolve time.
      for (const kw of ['table', 'into', 'set', 'over', 'using', 'references']) {
        const r = validateRefName(kw)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.kind).toBe('reserved_word')
      }
    })
  })

  describe('uniqueness', () => {
    it('rejects a duplicate name on another tab', () => {
      const taken = new Map([['active_users', 'tab-1']])
      const r = validateRefName('active_users', {
        takenNames: taken,
        ownTabId: 'tab-2'
      })
      expect(r.ok).toBe(false)
      if (!r.ok && r.error.kind === 'duplicate') {
        expect(r.error.conflictingTabId).toBe('tab-1')
      } else {
        throw new Error('expected duplicate error')
      }
    })

    it('allows keeping the same name on the same tab', () => {
      const taken = new Map([['active_users', 'tab-1']])
      const r = validateRefName('active_users', {
        takenNames: taken,
        ownTabId: 'tab-1'
      })
      expect(r.ok).toBe(true)
    })

    it('allows a name not in the taken set', () => {
      const taken = new Map([['active_users', 'tab-1']])
      const r = validateRefName('new_users', { takenNames: taken })
      expect(r.ok).toBe(true)
    })
  })
})
