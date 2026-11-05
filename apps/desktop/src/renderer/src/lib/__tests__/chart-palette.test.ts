import { describe, expect, it } from 'vitest'
import { CATEGORICAL_COLORS, seriesColors } from '../chart-palette'

describe('chart-palette', () => {
  it('exposes the eight categorical tokens in order', () => {
    expect(CATEGORICAL_COLORS).toEqual([
      'var(--cat-blue)',
      'var(--cat-cyan)',
      'var(--cat-green)',
      'var(--cat-yellow)',
      'var(--cat-orange)',
      'var(--cat-purple)',
      'var(--cat-pink)',
      'var(--cat-teal)'
    ])
  })

  it('returns the first n tokens', () => {
    expect(seriesColors(3)).toEqual(['var(--cat-blue)', 'var(--cat-cyan)', 'var(--cat-green)'])
  })

  it('cycles after eight series', () => {
    expect(seriesColors(10)[8]).toBe('var(--cat-blue)')
  })

  it('lets supplied colours win and fills the rest', () => {
    expect(seriesColors(3, ['#ff0000'])).toEqual(['#ff0000', 'var(--cat-blue)', 'var(--cat-cyan)'])
  })
})
