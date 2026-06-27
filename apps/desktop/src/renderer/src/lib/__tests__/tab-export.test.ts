import { describe, expect, it } from 'vitest'
import { getExportDataForTab } from '../tab-export'
import type { QueryTab, Tab } from '../../stores/tab-store'

function queryTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'tab-1',
    type: 'query',
    title: 'New Query',
    isPinned: false,
    connectionId: 'conn-1',
    createdAt: 0,
    order: 0,
    query: 'select 1',
    savedQuery: 'select 1',
    result: null,
    multiResult: null,
    activeResultIndex: 0,
    error: null,
    isExecuting: false,
    executionId: null,
    currentPage: 1,
    pageSize: 100,
    ...overrides
  }
}

describe('getExportDataForTab', () => {
  it('returns legacy single-result data for executable tabs', () => {
    const result = {
      columns: [{ name: 'id', dataType: 'integer' }],
      rows: [{ id: 1 }],
      rowCount: 1,
      durationMs: 4
    }

    expect(getExportDataForTab(queryTab({ result }))).toBe(result)
  })

  it('uses the active statement instead of the first legacy result for multi-results', () => {
    const data = getExportDataForTab(
      queryTab({
        activeResultIndex: 1,
        result: {
          columns: [{ name: 'first_id', dataType: 'integer' }],
          rows: [{ first_id: 1 }],
          rowCount: 1,
          durationMs: 3
        },
        multiResult: {
          statementCount: 2,
          totalDurationMs: 9,
          statements: [
            {
              statement: 'select 1 as first_id',
              statementIndex: 0,
              fields: [{ name: 'first_id', dataType: 'integer', dataTypeID: 23 }],
              rows: [{ first_id: 1 }],
              rowCount: 1,
              durationMs: 3,
              isDataReturning: true
            },
            {
              statement: 'select 2 as second_id',
              statementIndex: 1,
              fields: [{ name: 'second_id', dataType: 'integer', dataTypeID: 23 }],
              rows: [{ second_id: 2 }],
              rowCount: 1,
              durationMs: 6,
              isDataReturning: true
            }
          ]
        }
      })
    )

    expect(data).toEqual({
      columns: [{ name: 'second_id', dataType: 'integer' }],
      rows: [{ second_id: 2 }]
    })
  })

  it('returns null when a multi-result active index is no longer valid', () => {
    expect(
      getExportDataForTab(
        queryTab({
          activeResultIndex: 3,
          multiResult: {
            statementCount: 1,
            totalDurationMs: 1,
            statements: [
              {
                statement: 'select 1',
                statementIndex: 0,
                fields: [{ name: 'id', dataType: 'integer', dataTypeID: 23 }],
                rows: [{ id: 1 }],
                rowCount: 1,
                durationMs: 1,
                isDataReturning: true
              }
            ]
          }
        })
      )
    ).toBeNull()
  })

  it('returns null for non-executable tabs', () => {
    const erdTab: Tab = {
      id: 'erd-1',
      type: 'erd',
      title: 'ERD',
      isPinned: false,
      connectionId: 'conn-1',
      createdAt: 0,
      order: 0
    }

    expect(getExportDataForTab(erdTab)).toBeNull()
  })
})
