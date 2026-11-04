/**
 * Categorical series colours, in the order of the `--cat-*` theme tokens. Recharts and React Flow
 * both accept CSS variable strings as fill and stroke values, so the charts follow the theme.
 */
export const CATEGORICAL_COLORS: readonly string[] = [
  'var(--cat-blue)',
  'var(--cat-cyan)',
  'var(--cat-green)',
  'var(--cat-yellow)',
  'var(--cat-orange)',
  'var(--cat-purple)',
  'var(--cat-pink)',
  'var(--cat-teal)'
]

/**
 * Returns `count` series colours: `override` entries first (AI or user supplied colours win),
 * then the categorical palette from its start, cycling.
 */
export function seriesColors(count: number, override: string[] = []): string[] {
  const colors = override.slice(0, count)
  for (let i = colors.length; i < count; i++) {
    colors.push(CATEGORICAL_COLORS[(i - override.length) % CATEGORICAL_COLORS.length])
  }
  return colors
}
