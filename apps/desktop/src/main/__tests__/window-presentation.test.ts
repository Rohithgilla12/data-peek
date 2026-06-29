import { describe, it, expect } from 'vitest'
import { computeWindowTitles, pickFocusTarget } from '../window-presentation'

describe('computeWindowTitles', () => {
  it('returns no title for zero windows', () => {
    expect(computeWindowTitles([]).size).toBe(0)
  })

  it('uses the plain name for a single disconnected window', () => {
    const titles = computeWindowTitles([{ id: 1 }])
    expect(titles.get(1)).toBe('Data Peek')
  })

  it('appends the connection name for a single connected window', () => {
    const titles = computeWindowTitles([{ id: 1, connName: 'mydb' }])
    expect(titles.get(1)).toBe('Data Peek — mydb')
  })

  it('keeps unique connection names distinct across windows', () => {
    const titles = computeWindowTitles([
      { id: 1, connName: 'mydb' },
      { id: 2, connName: 'otherdb' }
    ])
    expect(titles.get(1)).toBe('Data Peek — mydb')
    expect(titles.get(2)).toBe('Data Peek — otherdb')
  })

  it('numbers windows that share the same connection name', () => {
    const titles = computeWindowTitles([
      { id: 1, connName: 'mydb' },
      { id: 2, connName: 'mydb' }
    ])
    expect(titles.get(1)).toBe('Data Peek — mydb — 1')
    expect(titles.get(2)).toBe('Data Peek — mydb — 2')
  })

  it('numbers multiple disconnected windows so they can be told apart', () => {
    const titles = computeWindowTitles([{ id: 1 }, { id: 2 }])
    expect(titles.get(1)).toBe('Data Peek — 1')
    expect(titles.get(2)).toBe('Data Peek — 2')
  })

  it('mixes connected and disconnected windows correctly', () => {
    const titles = computeWindowTitles([
      { id: 1, connName: 'mydb' },
      { id: 2, connName: null },
      { id: 3, connName: 'mydb' }
    ])
    expect(titles.get(1)).toBe('Data Peek — mydb — 1')
    expect(titles.get(3)).toBe('Data Peek — mydb — 2')
    // The lone disconnected window stays "Data Peek" — already distinct from
    // the connected ones, so no number is needed.
    expect(titles.get(2)).toBe('Data Peek')
  })
})

describe('pickFocusTarget', () => {
  it('returns null when there are no windows', () => {
    expect(pickFocusTarget([], [])).toBeNull()
  })

  it('restores the most recently focused window — the core issue #195 fix', () => {
    // Window 1 opened first, then window 2 was focused most recently.
    expect(pickFocusTarget([1, 2], [1, 2])).toBe(2)
  })

  it('does not regress to the first window after switching focus', () => {
    // Focus moved 1 -> 2 -> 1 -> 2; the active window is 2, never 1.
    expect(pickFocusTarget([1, 2, 1, 2], [1, 2])).toBe(2)
  })

  it('skips a focused-but-now-closed window', () => {
    // Window 2 was focused last but has since been closed (not in aliveIds).
    expect(pickFocusTarget([1, 2], [1])).toBe(1)
  })

  it('falls back to the most recently opened window, not the first', () => {
    // No usable focus history; aliveIds is creation order, so pick the newest.
    expect(pickFocusTarget([], [1, 2, 3])).toBe(3)
  })

  it('ignores stale focus ids that are no longer alive', () => {
    // Focus history references windows 5 and 6, but only 3 and 4 remain.
    expect(pickFocusTarget([5, 6], [3, 4])).toBe(4)
  })
})
