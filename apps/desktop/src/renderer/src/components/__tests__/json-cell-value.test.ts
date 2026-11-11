import { describe, it, expect } from 'vitest'
import { isInitiallyExpanded } from '@/components/json-cell-value'

describe('isInitiallyExpanded', () => {
  it('opens levels below the configured depth when Expand JSON cells is on', () => {
    expect(isInitiallyExpanded(0, { expandAll: true, maxDepth: 3 })).toBe(true)
    expect(isInitiallyExpanded(2, { expandAll: true, maxDepth: 3 })).toBe(true)
    expect(isInitiallyExpanded(3, { expandAll: true, maxDepth: 3 })).toBe(false)
    expect(isInitiallyExpanded(1, { expandAll: true, maxDepth: 1 })).toBe(false)
    expect(isInitiallyExpanded(9, { expandAll: true, maxDepth: 10 })).toBe(true)
  })

  it('keeps the first two levels open when Expand JSON cells is off, whatever the depth', () => {
    expect(isInitiallyExpanded(1, { expandAll: false, maxDepth: 5 })).toBe(true)
    expect(isInitiallyExpanded(2, { expandAll: false, maxDepth: 5 })).toBe(false)
    expect(isInitiallyExpanded(1)).toBe(true)
    expect(isInitiallyExpanded(2)).toBe(false)
  })
})
