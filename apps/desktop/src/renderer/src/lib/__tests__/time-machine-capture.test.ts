import { describe, it, expect } from 'vitest'
import type { StatementResult } from '@data-peek/shared'
import { TM_MAX_SNAPSHOT_ROWS } from '@data-peek/shared'
import { buildCapturePayload, type BuildCaptureInput } from '../time-machine-capture'

function makeStatement(overrides: Partial<StatementResult> = {}): StatementResult {
  return {
    statement: 'SELECT * FROM users',
    statementIndex: 0,
    rows: [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' }
    ],
    fields: [
      { name: 'id', dataType: 'int4' },
      { name: 'name', dataType: 'text' }
    ],
    rowCount: 2,
    durationMs: 18,
    isDataReturning: true,
    ...overrides
  }
}

function makeInput(overrides: Partial<BuildCaptureInput> = {}): BuildCaptureInput {
  return {
    enabled: true,
    tabType: 'query',
    connectionId: 'conn-1',
    sql: 'SELECT * FROM users',
    statements: [makeStatement()],
    explicitKeyColumns: undefined,
    maskedColumns: new Set<string>(),
    capturedAt: 1750000000000,
    ...overrides
  }
}

describe('buildCapturePayload gating', () => {
  it('captures an eligible single-statement SELECT', () => {
    const payload = buildCapturePayload(makeInput())
    expect(payload).not.toBeNull()
    expect(payload!.connectionId).toBe('conn-1')
    expect(payload!.sql).toBe('SELECT * FROM users')
    expect(payload!.rowCount).toBe(2)
    expect(payload!.truncated).toBe(false)
    expect(payload!.rows).toEqual([
      [1, 'alpha'],
      [2, 'beta']
    ])
  })

  it('returns null when the feature is disabled', () => {
    expect(buildCapturePayload(makeInput({ enabled: false }))).toBeNull()
  })

  it('returns null for non-query tabs (table previews page-flip too much)', () => {
    expect(buildCapturePayload(makeInput({ tabType: 'table-preview' }))).toBeNull()
  })

  it('returns null for destructive SQL', () => {
    expect(
      buildCapturePayload(makeInput({ sql: "UPDATE users SET name = 'x' WHERE id = 1" }))
    ).toBeNull()
    expect(buildCapturePayload(makeInput({ sql: 'DROP TABLE users' }))).toBeNull()
  })

  it('returns null for multi-statement SQL', () => {
    expect(buildCapturePayload(makeInput({ sql: 'SELECT 1; SELECT 2' }))).toBeNull()
  })

  it('returns null when no statement returned data', () => {
    expect(
      buildCapturePayload(makeInput({ statements: [makeStatement({ isDataReturning: false })] }))
    ).toBeNull()
  })

  it('returns null when several statements returned data', () => {
    expect(
      buildCapturePayload(
        makeInput({
          statements: [makeStatement(), makeStatement({ statementIndex: 1 })]
        })
      )
    ).toBeNull()
  })

  it('captures WITH ... SELECT CTEs', () => {
    const payload = buildCapturePayload(
      makeInput({ sql: 'WITH recent AS (SELECT * FROM users) SELECT * FROM recent' })
    )
    expect(payload).not.toBeNull()
  })

  it('captures empty result sets — an empty table is meaningful history', () => {
    const payload = buildCapturePayload(
      makeInput({ statements: [makeStatement({ rows: [], rowCount: 0 })] })
    )
    expect(payload).not.toBeNull()
    expect(payload!.rowCount).toBe(0)
    expect(payload!.rows).toEqual([])
  })
})

describe('buildCapturePayload row cap', () => {
  it('caps stored rows at TM_MAX_SNAPSHOT_ROWS and flags truncation', () => {
    const rows = Array.from({ length: TM_MAX_SNAPSHOT_ROWS + 5 }, (_, i) => ({
      id: i,
      name: `row-${i}`
    }))
    const payload = buildCapturePayload(
      makeInput({ statements: [makeStatement({ rows, rowCount: rows.length })] })
    )
    expect(payload).not.toBeNull()
    expect(payload!.rows.length).toBe(TM_MAX_SNAPSHOT_ROWS)
    expect(payload!.rowCount).toBe(TM_MAX_SNAPSHOT_ROWS + 5)
    expect(payload!.truncated).toBe(true)
  })
})

describe('buildCapturePayload keying plan', () => {
  it('uses explicit key columns when all are present in the projection', () => {
    const payload = buildCapturePayload(makeInput({ explicitKeyColumns: ['id'] }))
    expect(payload!.keyStrategy).toBe('primary_key')
    expect(payload!.keyColumns).toEqual(['id'])
  })

  it('falls back to the id heuristic without explicit keys', () => {
    const payload = buildCapturePayload(makeInput())
    expect(payload!.keyStrategy).toBe('primary_key')
    expect(payload!.keyColumns).toEqual(['id'])
  })

  it('falls back to row_position when nothing key-like exists', () => {
    const payload = buildCapturePayload(
      makeInput({
        statements: [
          makeStatement({
            rows: [{ total: 5 }],
            fields: [{ name: 'total', dataType: 'int8' }],
            rowCount: 1
          })
        ]
      })
    )
    expect(payload!.keyStrategy).toBe('row_position')
    expect(payload!.keyColumns).toEqual([])
  })
})

describe('buildCapturePayload masking', () => {
  it('redacts masked columns before the payload leaves the renderer', () => {
    const payload = buildCapturePayload(
      makeInput({
        maskedColumns: new Set(['name']),
        statements: [makeStatement()]
      })
    )
    expect(payload!.rows).toEqual([
      [1, '[MASKED]'],
      [2, '[MASKED]']
    ])
  })
})
