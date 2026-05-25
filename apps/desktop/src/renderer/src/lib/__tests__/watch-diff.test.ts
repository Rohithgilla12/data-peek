import { describe, it, expect } from 'vitest'
import { computeDiff } from '../watch-diff'
import { cellKey, type KeyingPlan } from '../watch-row-keying'

const pkPlan = (col: string): KeyingPlan => ({
  strategy: 'primary_key',
  keyColumns: [col]
})

const posPlan = (): KeyingPlan => ({ strategy: 'row_position', keyColumns: [] })

const now = 1_700_000_000_000

describe('computeDiff', () => {
  it('returns empty diff when there is no previous snapshot', () => {
    const diff = computeDiff({
      next: {
        rows: [{ id: 1, name: 'a' }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'name']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.cells.size).toBe(0)
    expect(diff.addedRowKeys.size).toBe(0)
    expect(diff.removedRowKeys.size).toBe(0)
  })

  it('detects added rows', () => {
    const diff = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [
          { id: 1, n: 1 },
          { id: 2, n: 2 }
        ],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.addedRowKeys).toEqual(new Set(['2']))
    expect(diff.removedRowKeys.size).toBe(0)
  })

  it('detects removed rows', () => {
    const diff = computeDiff({
      previous: {
        rows: [
          { id: 1, n: 1 },
          { id: 2, n: 2 }
        ],
        keyingPlan: pkPlan('id')
      },
      next: {
        rows: [{ id: 1, n: 1 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.removedRowKeys).toEqual(new Set(['2']))
  })

  it('detects per-cell changes and stamps changedAt', () => {
    const diff = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 99 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now,
      fadeMs: 8000
    })
    const cell = diff.cells.get(cellKey('1', 'n'))
    expect(cell?.kind).toBe('changed')
    expect(cell?.changedAt).toBe(now)
    expect(cell?.previousValue).toBe(1)
    expect(diff.cells.get(cellKey('1', 'id'))).toBeUndefined()
  })

  it('ignores unchanged cells', () => {
    const diff = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 1 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.cells.size).toBe(0)
  })

  it('row-position keying detects "different rows at same index" as changes', () => {
    const diff = computeDiff({
      previous: { rows: [{ name: 'a' }, { name: 'b' }], keyingPlan: posPlan() },
      next: {
        rows: [{ name: 'a' }, { name: 'c' }],
        keyingPlan: posPlan(),
        fieldNames: ['name']
      },
      now,
      fadeMs: 8000
    })
    const cell = diff.cells.get(cellKey('#1', 'name'))
    expect(cell?.kind).toBe('changed')
  })

  it('carries forward unchanged diff cells inside the fade window', () => {
    const tickA = now
    const diffA = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 2 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickA,
      fadeMs: 8000
    })
    expect(diffA.cells.get(cellKey('1', 'n'))?.changedAt).toBe(tickA)

    // Next tick — value didn't change again, but we're still within fade.
    const tickB = tickA + 1000
    const diffB = computeDiff({
      previous: { rows: [{ id: 1, n: 2 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 2 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickB,
      carryFromPrevious: diffA,
      fadeMs: 8000
    })
    // Carried forward, with the *original* changedAt timestamp.
    expect(diffB.cells.get(cellKey('1', 'n'))?.changedAt).toBe(tickA)
  })

  it('drops carried diffs past the fade window', () => {
    const tickA = now
    const diffA = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 2 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickA,
      fadeMs: 1000
    })
    const tickB = tickA + 5000
    const diffB = computeDiff({
      previous: { rows: [{ id: 1, n: 2 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 2 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickB,
      carryFromPrevious: diffA,
      fadeMs: 1000
    })
    expect(diffB.cells.size).toBe(0)
  })

  it('treats Date and ISO string as equal for compare purposes', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    const diff = computeDiff({
      previous: { rows: [{ id: 1, ts: d }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, ts: new Date('2026-01-01T00:00:00Z') }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'ts']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.cells.size).toBe(0)
  })

  it('detects changes in JSON object values', () => {
    const diff = computeDiff({
      previous: { rows: [{ id: 1, meta: { a: 1 } }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, meta: { a: 2 } }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'meta']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.cells.get(cellKey('1', 'meta'))?.kind).toBe('changed')
  })

  it('cell key does not collide when row key contains a colon (e.g. URN-style PKs)', () => {
    // Regression for the `${key}:${field}` collision: a row whose PK is
    // 'a:foo' would key its `bar` cell as `a:foo:bar`, which would also
    // be matched by row 'a' + field 'foo:bar'. The shared cellKey helper
    // uses a NUL separator so the namespaces stay disjoint.
    const diff = computeDiff({
      previous: { rows: [{ urn: 'a:foo', bar: 1 }], keyingPlan: pkPlan('urn') },
      next: {
        rows: [{ urn: 'a:foo', bar: 2 }],
        keyingPlan: pkPlan('urn'),
        fieldNames: ['urn', 'bar']
      },
      now,
      fadeMs: 8000
    })
    expect(diff.cells.get(cellKey('a:foo', 'bar'))?.kind).toBe('changed')
    // The pre-fix collision key must NOT be present:
    expect(diff.cells.get('a:foo:bar')).toBeUndefined()
  })

  it('does not double-count when a previously-changed cell changes again', () => {
    const tickA = now
    const diffA = computeDiff({
      previous: { rows: [{ id: 1, n: 1 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 2 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickA,
      fadeMs: 10_000
    })
    const tickB = tickA + 500
    const diffB = computeDiff({
      previous: { rows: [{ id: 1, n: 2 }], keyingPlan: pkPlan('id') },
      next: {
        rows: [{ id: 1, n: 3 }],
        keyingPlan: pkPlan('id'),
        fieldNames: ['id', 'n']
      },
      now: tickB,
      carryFromPrevious: diffA,
      fadeMs: 10_000
    })
    expect(diffB.cells.get(cellKey('1', 'n'))?.changedAt).toBe(tickB)
  })
})
