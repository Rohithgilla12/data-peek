import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClickHouseError } from '@clickhouse/client'
import type { ConnectionConfig, PerformanceAnalysisConfig } from '@shared/index'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../adapters/clickhouse-pool-manager', () => ({
  withClickHouseClient: (_config: unknown, fn: (client: unknown) => unknown) => fn({ query })
}))

import {
  analyzeClickHousePlan,
  findPoorPruning,
  type ChExplainJson,
  type ChIndexStep,
  type ChPlanNode
} from '../performance/clickhouse'

function step(
  type: string,
  initial: number,
  selected: number,
  extra: Partial<ChIndexStep> = {}
): ChIndexStep {
  return {
    Type: type,
    Condition: 'true',
    'Initial Parts': 4,
    'Selected Parts': 4,
    'Initial Granules': initial,
    'Selected Granules': selected,
    ...extra
  }
}

function read(table: string, indexes?: ChIndexStep[]): ChPlanNode {
  return { 'Node Type': 'ReadFromMergeTree', Description: table, Indexes: indexes }
}

/** Reads nested under the operator nodes ClickHouse 24.8 wraps them in. */
function plan(...reads: ChPlanNode[]): ChExplainJson {
  return [
    {
      Plan: {
        'Node Type': 'Expression',
        Plans: [
          {
            'Node Type': 'Aggregating',
            Plans: [{ 'Node Type': 'Filter', Plans: reads }]
          }
        ]
      }
    }
  ]
}

describe('findPoorPruning', () => {
  it('reports nothing when a primary key filter prunes most granules', () => {
    const issues = findPoorPruning(
      plan(
        read('db.events', [
          step('MinMax', 1000, 1000),
          step('Partition', 1000, 1000),
          step('PrimaryKey', 1000, 3, { Keys: ['org_id'], Condition: '(org_id in [3, 3])' })
        ])
      )
    )
    expect(issues).toEqual([])
  })

  it('flags a full read of a large table as critical, naming table, granules and condition', () => {
    const [issue, ...rest] = findPoorPruning(
      plan(
        read('db.events', [
          step('MinMax', 1000, 1000),
          step('Partition', 1000, 1000),
          step('PrimaryKey', 1000, 1000)
        ])
      )
    )
    expect(rest).toEqual([])
    expect(issue).toMatchObject({
      type: 'poor_pruning',
      severity: 'critical',
      tableName: 'db.events',
      planNodeType: 'ReadFromMergeTree'
    })
    expect(issue.message).toBe(
      'Query reads 1000 of 1000 granules (100%) from db.events; no condition uses the primary key.'
    )
    expect(issue.suggestion).toMatch(/ORDER BY key.*data-skipping index or projection/)
    expect(issue.planNodeDetails).toMatchObject({ initialGranules: 1000, selectedGranules: 1000 })
  })

  it('names the primary key condition when one applies but still reads most granules', () => {
    const [issue] = findPoorPruning(
      plan(
        read('db.events', [
          step('PrimaryKey', 200, 150, { Keys: ['org_id'], Condition: '(org_id in [0, 900])' })
        ])
      )
    )
    expect(issue.severity).toBe('warning')
    expect(issue.message).toBe(
      'Query reads 150 of 200 granules (75%) from db.events; the primary key condition is (org_id in [0, 900]).'
    )
  })

  it('keeps a full read under the critical floor as a warning', () => {
    const [issue] = findPoorPruning(plan(read('db.mid', [step('PrimaryKey', 64, 64)])))
    expect(issue.severity).toBe('warning')
  })

  it('ignores tables below the 8-granule floor', () => {
    expect(findPoorPruning(plan(read('db.small', [step('PrimaryKey', 7, 7)])))).toEqual([])
    expect(findPoorPruning(plan(read('db.small', [step('PrimaryKey', 8, 8)])))).toHaveLength(1)
  })

  it('does not flag exactly half the granules', () => {
    expect(findPoorPruning(plan(read('db.half', [step('PrimaryKey', 100, 50)])))).toEqual([])
    expect(findPoorPruning(plan(read('db.half', [step('PrimaryKey', 100, 51)])))).toHaveLength(1)
  })

  it('measures pruning across all index steps, not only the primary key step', () => {
    const issues = findPoorPruning(
      plan(
        read('db.partitioned', [
          step('MinMax', 1000, 400),
          step('Partition', 400, 400),
          step('PrimaryKey', 400, 400)
        ])
      )
    )
    expect(issues).toEqual([])
  })

  it('skips nodes without index information', () => {
    const memory: ChPlanNode = { 'Node Type': 'ReadFromMemoryStorage' }
    expect(findPoorPruning(plan(memory, read('db.view_source', [])))).toEqual([])
  })

  it('reports each badly pruned read of a join separately', () => {
    const issues = findPoorPruning(
      plan(
        read('db.events', [step('PrimaryKey', 500, 500)]),
        read('db.orgs', [step('PrimaryKey', 500, 2, { Condition: '(id in [1, 1])' })])
      )
    )
    expect(issues.map((i) => i.tableName)).toEqual(['db.events'])
  })
})

/** Nests `leaf` under the given node types, outermost first, as one plan. */
function chain(types: string[], leaf: ChPlanNode): ChExplainJson {
  const root = types.reduceRight<ChPlanNode>(
    (child, type) => ({ 'Node Type': type, Plans: [child] }),
    leaf
  )
  return [{ Plan: root }]
}

describe('findPoorPruning under LIMIT', () => {
  const fullRead = (): ChPlanNode => read('db.events', [step('PrimaryKey', 367, 367)])

  it('downgrades a full-eligible read that LIMIT can stop early to info', () => {
    const issues = findPoorPruning(chain(['Expression', 'Limit', 'Expression'], fullRead()))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ type: 'poor_pruning', severity: 'info' })
    expect(issues[0].message).toBe(
      'Indexes leave 367 of 367 granules eligible in db.events, but LIMIT can stop the read early; the runtime stats show the rows actually read.'
    )
    expect(issues[0].planNodeDetails).toMatchObject({ limitedRead: true })
  })

  it('treats a Filter between LIMIT and the read as streaming', () => {
    const [issue] = findPoorPruning(chain(['Limit', 'Filter'], fullRead()))
    expect(issue.severity).toBe('info')
  })

  it.each([
    ['Sorting', ['Limit', 'Sorting', 'Expression']],
    ['Aggregating', ['Limit', 'Aggregating', 'Expression']],
    ['LimitBy', ['LimitBy', 'Expression']]
  ])('still flags a full read when %s sits between the limit and the read', (_, types) => {
    const [issue] = findPoorPruning(chain(types, fullRead()))
    expect(issue.severity).toBe('critical')
    expect(issue.message).toMatch(/^Query reads 367 of 367 granules/)
    expect(issue.planNodeDetails).toMatchObject({ limitedRead: false })
  })
})

const settings: PerformanceAnalysisConfig = {
  slowQueryThresholdMs: 1000,
  nplusOneWindowMs: 5000,
  nplusOneMinOccurrences: 3,
  historyLookbackCount: 50
}
const config = { id: 'ch', dbType: 'clickhouse' } as ConnectionConfig

const fullScanExplain = plan(read('db.events', [step('PrimaryKey', 1000, 1000)]))

function statsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    executions: '12',
    failed: '1',
    duration_quantiles: [120, 2300],
    max_ms: '4100',
    avg_read_rows: 1_200_000,
    avg_read_bytes: 48_000_000,
    max_memory_bytes: '310000000',
    last_seen: 1_790_000_000,
    ...overrides
  }
}

function respond(row: Record<string, unknown> | Error): void {
  query.mockImplementation(async (params: { query: string }) => {
    if (params.query.startsWith('EXPLAIN')) {
      return { json: async () => ({ data: [{ explain: JSON.stringify(fullScanExplain) }] }) }
    }
    if (row instanceof Error) throw row
    return { json: async () => ({ data: [row] }) }
  })
}

function logQueryCall(): { query: string; query_params: Record<string, unknown> } {
  return query.mock.calls.map((c) => c[0]).find((p) => p.query.includes('system.query_log'))
}

beforeEach(() => {
  query.mockReset()
})

describe('analyzeClickHousePlan', () => {
  it('combines pruning issues, runtime stats, and a slow query from p95', async () => {
    respond(statsRow())
    const result = await analyzeClickHousePlan(
      config,
      "SELECT count() FROM events WHERE status = 'error';",
      settings
    )

    expect(result.issues.map((i) => [i.type, i.severity])).toEqual([
      ['poor_pruning', 'critical'],
      ['slow_query', 'critical']
    ])
    expect(result.issues[1]).toMatchObject({ threshold: 1000, actualValue: 2300 })
    expect(result.explainPlan).toEqual(fullScanExplain)
    expect(result.runtimeStats).toEqual({
      status: 'ok',
      windowDays: 7,
      executions: 12,
      failed: 1,
      p50Ms: 120,
      p95Ms: 2300,
      maxMs: 4100,
      avgReadRows: 1_200_000,
      avgReadBytes: 48_000_000,
      maxMemoryBytes: 310_000_000,
      lastSeenAt: 1_790_000_000_000
    })
  })

  it('keeps the runtime stats and slow query when EXPLAIN fails', async () => {
    query.mockImplementation(async (params: { query: string }) => {
      if (params.query.startsWith('EXPLAIN')) throw new Error('Unknown table expression')
      return { json: async () => ({ data: [statsRow()] }) }
    })
    const result = await analyzeClickHousePlan(config, 'SELECT * FROM missing', settings)

    expect(result.explainPlan).toBeUndefined()
    expect(result.runtimeStats?.status).toBe('ok')
    expect(result.issues.map((i) => i.type)).toEqual(['slow_query'])
  })

  it('counts only initial queries, not the child queries a distributed read sends to shards', async () => {
    respond(statsRow())
    await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(logQueryCall().query).toContain('is_initial_query = 1')
  })

  it('passes the statement as query parameters, in both the typed and the sent form', async () => {
    respond(statsRow())
    const statement = "SELECT count() FROM events WHERE status = 'error'"
    await analyzeClickHousePlan(config, `${statement};`, settings)

    const call = logQueryCall()
    expect(call.query).not.toContain('events')
    expect(call.query_params).toEqual({
      days: 7,
      typed: statement,
      sent: `${statement} \nFORMAT JSON`
    })
  })

  it('warns below twice the threshold and stays quiet under it', async () => {
    respond(statsRow({ duration_quantiles: [100, 1500] }))
    const warn = await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(warn.issues.find((i) => i.type === 'slow_query')?.severity).toBe('warning')

    respond(statsRow({ duration_quantiles: [100, 900] }))
    const fast = await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(fast.issues.some((i) => i.type === 'slow_query')).toBe(false)
  })

  it('reports no_history when the shape never finished in the window', async () => {
    respond(statsRow({ executions: '0', failed: '2' }))
    const result = await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(result.runtimeStats).toEqual({ status: 'no_history', windowDays: 7 })
    expect(result.issues.map((i) => i.type)).toEqual(['poor_pruning'])
  })

  it('degrades to unavailable without failing the analysis when query_log is denied', async () => {
    respond(
      new ClickHouseError({
        message: 'user: Not enough privileges.\nmore detail',
        code: '497',
        type: 'ACCESS_DENIED'
      })
    )
    const result = await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(result.runtimeStats).toEqual({
      status: 'unavailable',
      reason: 'No permission to read system.query_log'
    })
    expect(result.issues.map((i) => i.type)).toEqual(['poor_pruning'])
  })

  it('keeps only the first line of an unrecognised error as the reason', async () => {
    respond(new Error('socket hang up\nstack'))
    const result = await analyzeClickHousePlan(config, 'SELECT 1', settings)
    expect(result.runtimeStats).toEqual({ status: 'unavailable', reason: 'socket hang up' })
  })

  it('skips EXPLAIN for a non-SELECT statement but still reads its history', async () => {
    respond(statsRow({ executions: '0' }))
    const result = await analyzeClickHousePlan(config, 'INSERT INTO t VALUES (1)', settings)
    expect(query.mock.calls.some((c) => c[0].query.startsWith('EXPLAIN'))).toBe(false)
    expect(result.explainPlan).toBeUndefined()
    expect(result.runtimeStats?.status).toBe('no_history')
  })

  it('explains a WITH query', async () => {
    respond(statsRow({ executions: '0' }))
    await analyzeClickHousePlan(config, 'WITH 1 AS x SELECT x', settings)
    expect(query.mock.calls[0][0].query).toBe(
      'EXPLAIN json = 1, indexes = 1, description = 1 WITH 1 AS x SELECT x'
    )
  })

  it('refuses more than one statement with the adapter EXPLAIN message', async () => {
    await expect(analyzeClickHousePlan(config, 'SELECT 1; SELECT 2', settings)).rejects.toThrow(
      /Explain needs a single statement/
    )
    expect(query).not.toHaveBeenCalled()
  })
})
