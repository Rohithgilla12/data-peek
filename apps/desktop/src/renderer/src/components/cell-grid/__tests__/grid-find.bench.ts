import { bench, describe } from 'vitest'
import { buildFindIndex, findMatches } from '../grid-find'

const ROWS = 100_000
const columns = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}` }))
const rows = Array.from({ length: ROWS }, (_, r) => ({
  c0: r,
  c1: `user_${r}@example.com`,
  c2: r * 1.5,
  c3: r % 7 === 0 ? null : `label ${r % 1000}`,
  c4: { id: r, tags: ['a', 'b'] },
  c5: r % 2 === 0,
  c6: `2026-04-${String((r % 28) + 1).padStart(2, '0')}T10:00:00Z`,
  c7: 'lorem ipsum dolor sit amet',
  c8: r % 13,
  c9: `ORD-${r}`
}))
const notMasked = () => false
const index = buildFindIndex(rows, columns, notMasked)
index.lowered()

describe(`buildFindIndex over ${ROWS} rows x 10 cols`, () => {
  bench('index (once per result)', () => {
    buildFindIndex(rows, columns, notMasked)
  })
  bench('lowered texts (once, on the first case-insensitive search)', () => {
    buildFindIndex(rows, columns, notMasked).lowered()
  })
})

describe(`findMatches per keystroke over ${ROWS} rows x 10 cols`, () => {
  bench('substring, case-insensitive, rare needle', () => {
    findMatches(index, { needle: 'user_99999@', caseSensitive: false, regex: false })
  })
  bench('substring, case-sensitive, rare needle', () => {
    findMatches(index, { needle: 'user_99999@', caseSensitive: true, regex: false })
  })
  bench('substring, case-insensitive, matches most cells', () => {
    findMatches(index, { needle: 'e', caseSensitive: false, regex: false })
  })
  bench('regex', () => {
    findMatches(index, { needle: 'ORD-9\\d{4}$', caseSensitive: false, regex: true })
  })
})
