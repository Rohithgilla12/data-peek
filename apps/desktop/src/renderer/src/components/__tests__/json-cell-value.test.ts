import { describe, it, expect } from 'vitest'
import { isInitiallyExpanded } from '@/components/json-cell-value'

describe('isInitiallyExpanded', () => {
  describe('when expandAll is true', () => {
    it('expands nodes with depth below maxDepth', () => {
      expect(isInitiallyExpanded(0, { expandAll: true, maxDepth: 3 })).toBe(true)
      expect(isInitiallyExpanded(1, { expandAll: true, maxDepth: 3 })).toBe(true)
      expect(isInitiallyExpanded(2, { expandAll: true, maxDepth: 3 })).toBe(true)
    })

    it('collapses nodes with depth at or beyond maxDepth', () => {
      expect(isInitiallyExpanded(3, { expandAll: true, maxDepth: 3 })).toBe(false)
      expect(isInitiallyExpanded(4, { expandAll: true, maxDepth: 3 })).toBe(false)
    })

    it('defaults maxDepth to 2 if maxDepth is omitted', () => {
      expect(isInitiallyExpanded(0, { expandAll: true })).toBe(true)
      expect(isInitiallyExpanded(1, { expandAll: true })).toBe(true)
      expect(isInitiallyExpanded(2, { expandAll: true })).toBe(false)
      expect(isInitiallyExpanded(3, { expandAll: true })).toBe(false)
    })

    it('supports maxDepth of 1', () => {
      expect(isInitiallyExpanded(0, { expandAll: true, maxDepth: 1 })).toBe(true)
      expect(isInitiallyExpanded(1, { expandAll: true, maxDepth: 1 })).toBe(false)
    })

    it('supports maxDepth up to 10', () => {
      expect(isInitiallyExpanded(9, { expandAll: true, maxDepth: 10 })).toBe(true)
      expect(isInitiallyExpanded(10, { expandAll: true, maxDepth: 10 })).toBe(false)
    })
  })

  describe('when expandAll is false', () => {
    it('expands the first two levels only (depth < 2)', () => {
      expect(isInitiallyExpanded(0, { expandAll: false })).toBe(true)
      expect(isInitiallyExpanded(1, { expandAll: false })).toBe(true)
      expect(isInitiallyExpanded(2, { expandAll: false })).toBe(false)
      expect(isInitiallyExpanded(3, { expandAll: false })).toBe(false)
    })

    it('ignores maxDepth when expandAll is false', () => {
      expect(isInitiallyExpanded(0, { expandAll: false, maxDepth: 5 })).toBe(true)
      expect(isInitiallyExpanded(1, { expandAll: false, maxDepth: 5 })).toBe(true)
      expect(isInitiallyExpanded(2, { expandAll: false, maxDepth: 5 })).toBe(false)
      expect(isInitiallyExpanded(4, { expandAll: false, maxDepth: 5 })).toBe(false)
    })
  })

  describe('default arguments', () => {
    it('defaults expandAll to false and maxDepth to 2 when options are omitted', () => {
      expect(isInitiallyExpanded(0)).toBe(true)
      expect(isInitiallyExpanded(1)).toBe(true)
      expect(isInitiallyExpanded(2)).toBe(false)
    })
  })
})
