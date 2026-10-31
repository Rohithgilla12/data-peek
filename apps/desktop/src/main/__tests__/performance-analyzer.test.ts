import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DB_CAPABILITIES,
  type ConnectionConfig,
  type DatabaseType,
  type QueryHistoryItemForAnalysis
} from '@shared/index'

const { explain } = vi.hoisted(() => ({ explain: vi.fn() }))

vi.mock('../db-adapter', () => ({ getAdapter: () => ({ explain }) }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { analyzeQueryPerformance, PLAN_ANALYZERS } from '../performance-analyzer'

const pgConfig = { id: 'pg1', dbType: 'postgresql' } as ConnectionConfig

const seqScanPlan = [
  {
    Plan: {
      'Node Type': 'Seq Scan',
      'Relation Name': 'orders',
      Schema: 'public',
      Filter: '(customer_id = 42)',
      'Actual Rows': 20000,
      'Plan Rows': 19000,
      'Rows Removed by Filter': 980000
    },
    'Execution Time': 2500
  }
]

function history(
  query: string,
  count: number,
  connectionId = 'pg1'
): QueryHistoryItemForAnalysis[] {
  return Array.from({ length: count }, (_, i) => ({ query, timestamp: 1000 + i, connectionId }))
}

beforeEach(() => {
  explain.mockReset()
})

describe('analyzeQueryPerformance on postgresql', () => {
  it('reports plan issues, a slow query, and N+1 patterns in that order', async () => {
    explain.mockResolvedValue({ plan: seqScanPlan, durationMs: 3 })
    const result = await analyzeQueryPerformance(
      pgConfig,
      'SELECT * FROM orders WHERE customer_id = 42',
      history('SELECT * FROM items WHERE order_id = 1', 4)
    )

    expect(explain).toHaveBeenCalledWith(
      pgConfig,
      'SELECT * FROM orders WHERE customer_id = 42',
      true
    )
    expect(result.dbType).toBe('postgresql')
    expect(result.connectionId).toBe('pg1')
    expect(result.explainPlan).toBe(seqScanPlan[0])
    expect(result.runtimeStats).toBeUndefined()
    expect(result.issues.map((i) => [i.type, i.severity])).toEqual([
      ['missing_index', 'critical'],
      ['high_filter_ratio', 'warning'],
      ['slow_query', 'critical'],
      ['n_plus_one', 'warning']
    ])
    expect(result.issues[0].indexSuggestion).toContain('customer_id')
    expect(result.issueCount).toEqual({ critical: 2, warning: 2, info: 0 })
    expect(result.nplusOnePatterns).toHaveLength(1)
    expect(result.nplusOnePatterns[0].occurrences).toBe(4)
  })

  it('treats a config without dbType as postgresql', async () => {
    explain.mockResolvedValue({ plan: seqScanPlan, durationMs: 3 })
    const result = await analyzeQueryPerformance(
      { id: 'legacy' } as ConnectionConfig,
      'SELECT * FROM orders WHERE customer_id = 42',
      []
    )
    expect(explain).toHaveBeenCalledTimes(1)
    expect(result.dbType).toBe('postgresql')
    expect(result.issues.map((i) => i.type)).toContain('missing_index')
  })

  it('skips EXPLAIN for non-SELECT statements and keeps going when EXPLAIN fails', async () => {
    const update = await analyzeQueryPerformance(pgConfig, 'UPDATE orders SET x = 1', [])
    expect(explain).not.toHaveBeenCalled()
    expect(update.issues).toEqual([])

    explain.mockRejectedValue(new Error('relation does not exist'))
    const failed = await analyzeQueryPerformance(
      pgConfig,
      'SELECT * FROM missing',
      history('SELECT * FROM items WHERE order_id = 1', 3)
    )
    expect(failed.explainPlan).toBeUndefined()
    expect(failed.issues.map((i) => i.type)).toEqual(['n_plus_one'])
  })

  it('ignores history from other connections', async () => {
    explain.mockResolvedValue({ plan: [], durationMs: 1 })
    const result = await analyzeQueryPerformance(
      pgConfig,
      'SELECT 1',
      history('SELECT * FROM items WHERE order_id = 1', 5, 'other')
    )
    expect(result.nplusOnePatterns).toEqual([])
  })
})

describe('plan analyzer registry', () => {
  it('has an entry for exactly the database types with the performanceAnalysis capability', () => {
    const enabled = (Object.keys(DB_CAPABILITIES) as DatabaseType[]).filter(
      (dbType) => DB_CAPABILITIES[dbType].performanceAnalysis
    )
    expect(Object.keys(PLAN_ANALYZERS).sort()).toEqual(enabled.sort())
  })

  it('rejects a database type without the capability before touching the server', async () => {
    await expect(
      analyzeQueryPerformance({ id: 'my', dbType: 'mysql' } as ConnectionConfig, 'SELECT 1', [])
    ).rejects.toThrow('Performance analysis is not available for MySQL connections.')
    expect(explain).not.toHaveBeenCalled()
  })
})
