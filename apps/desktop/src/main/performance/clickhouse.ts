import { v4 as uuidv4 } from 'uuid'
import { ClickHouseError, type ClickHouseClient } from '@clickhouse/client'
import type { PerformanceIssue, QueryRuntimeStats } from '@shared/index'
import { withClickHouseClient } from '../adapters/clickhouse-pool-manager'
import { RESULT_FORMAT, sentQueryText, stripLeading } from '../adapters/clickhouse-mapping'
import { requireSingleStatement } from '../lib/sql-parser'
import { createLogger } from '../lib/logger'
import type { PlanAnalyzer } from '../performance-analyzer'

const log = createLogger('performance-analyzer:clickhouse')

export const RUNTIME_WINDOW_DAYS = 7
/** Below this a full read is a few granules and not worth flagging. */
const MIN_GRANULES = 8
const CRITICAL_MIN_GRANULES = 128

/** One index step of a ReadFromMergeTree node in `EXPLAIN json = 1, indexes = 1`. */
export interface ChIndexStep {
  Type: string
  Name?: string
  Keys?: string[]
  Condition?: string
  'Initial Parts'?: number
  'Selected Parts'?: number
  'Initial Granules'?: number
  'Selected Granules'?: number
}

export interface ChPlanNode {
  'Node Type': string
  Description?: string
  Indexes?: ChIndexStep[]
  Plans?: ChPlanNode[]
}

export type ChExplainJson = Array<{ Plan: ChPlanNode }>

/** Nodes that pass rows through one at a time, so a LIMIT above them can stop the read below. */
const STREAMING_NODES = new Set(['Expression', 'Filter'])

/**
 * Index steps apply in sequence (MinMax, Partition, PrimaryKey, Skip), so a read's overall
 * pruning is the last step's selected granules over the first step's initial granules.
 * EXPLAIN counts the granules left eligible, not the ones a LIMIT lets the read skip.
 */
export function findPoorPruning(explain: ChExplainJson): PerformanceIssue[] {
  const issues: PerformanceIssue[] = []
  const visit = (node: ChPlanNode, limited: boolean): void => {
    const issue = pruningIssue(node, limited)
    if (issue) issues.push(issue)
    const type = node['Node Type']
    const childLimited = type === 'Limit' || (limited && STREAMING_NODES.has(type))
    node.Plans?.forEach((child) => visit(child, childLimited))
  }
  for (const entry of explain) visit(entry.Plan, false)
  return issues
}

function pruningIssue(node: ChPlanNode, limited: boolean): PerformanceIssue | undefined {
  const steps = node.Indexes
  if (!steps || steps.length === 0) return undefined
  const initial = steps[0]['Initial Granules']
  const selected = steps[steps.length - 1]['Selected Granules']
  if (initial === undefined || selected === undefined) return undefined
  if (initial < MIN_GRANULES || selected * 2 <= initial) return undefined

  const table = node.Description ?? 'the table'
  const keyCondition = steps.find((s) => s.Type === 'PrimaryKey')?.Condition
  const keyClause =
    keyCondition && keyCondition !== 'true'
      ? `the primary key condition is ${keyCondition}`
      : 'no condition uses the primary key'
  const percent = Math.round((selected / initial) * 100)
  const fullRead = selected >= initial && initial >= CRITICAL_MIN_GRANULES

  return {
    id: uuidv4(),
    type: 'poor_pruning',
    severity: limited ? 'info' : fullRead ? 'critical' : 'warning',
    title: 'Poor Granule Pruning',
    message: limited
      ? `Indexes leave ${selected} of ${initial} granules eligible in ${table}, but LIMIT can stop the read early; the runtime stats show the rows actually read.`
      : `Query reads ${selected} of ${initial} granules (${percent}%) from ${table}; ${keyClause}.`,
    suggestion:
      "Filter on a leading column of the table's ORDER BY key, or add a data-skipping index or projection for the filtered column.",
    tableName: table,
    planNodeType: node['Node Type'],
    planNodeDetails: {
      initialGranules: initial,
      selectedGranules: selected,
      limitedRead: limited,
      primaryKeyCondition: keyCondition,
      indexes: steps.map((s) => ({
        type: s.Type,
        name: s.Name,
        keys: s.Keys,
        condition: s.Condition,
        initialGranules: s['Initial Granules'],
        selectedGranules: s['Selected Granules']
      }))
    }
  }
}

/**
 * The second hash matches every run data-peek made of this query shape: the server
 * normalizes literals and whitespace, and the client adds the format clause.
 * `is_initial_query` drops the child row each shard logs for a distributed read.
 */
const RUNTIME_STATS_SQL = `
  SELECT countIf(type = 'QueryFinish') AS executions,
         countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failed,
         quantilesIf(0.5, 0.95)(query_duration_ms, type = 'QueryFinish') AS duration_quantiles,
         maxIf(query_duration_ms, type = 'QueryFinish') AS max_ms,
         avgIf(read_rows, type = 'QueryFinish') AS avg_read_rows,
         avgIf(read_bytes, type = 'QueryFinish') AS avg_read_bytes,
         max(memory_usage) AS max_memory_bytes,
         toUnixTimestamp(max(event_time)) AS last_seen
  FROM system.query_log
  WHERE event_date >= today() - {days:UInt16}
    AND type != 'QueryStart'
    AND is_initial_query = 1
    AND current_database = currentDatabase()
    AND normalized_query_hash IN (normalizedQueryHash({typed:String}),
                                  normalizedQueryHash({sent:String}))`

interface RuntimeStatsRow {
  executions: string | number
  failed: string | number
  duration_quantiles: number[]
  max_ms: string | number
  avg_read_rows: number
  avg_read_bytes: number
  max_memory_bytes: string | number
  last_seen: string | number
}

async function fetchRuntimeStats(
  client: ClickHouseClient,
  statement: string
): Promise<QueryRuntimeStats> {
  try {
    const rs = await client.query({
      query: RUNTIME_STATS_SQL,
      format: 'JSON',
      query_params: {
        days: RUNTIME_WINDOW_DAYS,
        typed: statement,
        sent: sentQueryText(statement)
      }
    })
    const [row] = (await rs.json<RuntimeStatsRow>()).data
    const executions = Number(row?.executions ?? 0)
    if (executions === 0) return { status: 'no_history', windowDays: RUNTIME_WINDOW_DAYS }
    const [p50Ms, p95Ms] = row.duration_quantiles
    return {
      status: 'ok',
      windowDays: RUNTIME_WINDOW_DAYS,
      executions,
      failed: Number(row.failed),
      p50Ms,
      p95Ms,
      maxMs: Number(row.max_ms),
      avgReadRows: row.avg_read_rows,
      avgReadBytes: row.avg_read_bytes,
      maxMemoryBytes: Number(row.max_memory_bytes),
      lastSeenAt: Number(row.last_seen) * 1000
    }
  } catch (error) {
    log.warn('query_log unavailable:', error)
    return { status: 'unavailable', reason: unavailableReason(error) }
  }
}

function unavailableReason(error: unknown): string {
  if (error instanceof ClickHouseError) {
    if (error.type === 'ACCESS_DENIED') return 'No permission to read system.query_log'
    if (error.type === 'UNKNOWN_TABLE') return 'system.query_log is not enabled on this server'
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0]
}

async function explainJson(client: ClickHouseClient, statement: string): Promise<ChExplainJson> {
  const rs = await client.query({
    query: `EXPLAIN json = 1, indexes = 1, description = 1 ${statement}`,
    format: RESULT_FORMAT
  })
  const { data } = await rs.json<{ explain: string }>()
  return JSON.parse(data.map((r) => r.explain).join('\n')) as ChExplainJson
}

function slowQueryIssue(
  stats: QueryRuntimeStats,
  thresholdMs: number
): PerformanceIssue | undefined {
  if (stats.status !== 'ok' || stats.p95Ms <= thresholdMs) return undefined
  return {
    id: uuidv4(),
    type: 'slow_query',
    severity: stats.p95Ms > thresholdMs * 2 ? 'critical' : 'warning',
    title: 'Slow Query',
    message: `p95 over ${stats.executions} runs in the last ${stats.windowDays} days was ${stats.p95Ms.toFixed(0)}ms, exceeding the ${thresholdMs}ms threshold.`,
    suggestion:
      'Narrow the read: filter on the ORDER BY key, select fewer columns, or pre-aggregate with a materialized view.',
    threshold: thresholdMs,
    actualValue: stats.p95Ms
  }
}

/** Reads the plan and the server's own log; never runs the user's statement. */
export const analyzeClickHousePlan: PlanAnalyzer = async (connectionConfig, query, config) => {
  const statement = requireSingleStatement(query, 'clickhouse')
  const isSelect = /^(SELECT|WITH)\b/i.test(stripLeading(statement))

  return withClickHouseClient(connectionConfig, async (client) => {
    const [explainPlan, runtimeStats] = await Promise.all([
      isSelect
        ? explainJson(client, statement).catch((error) => {
            log.warn('EXPLAIN failed:', error)
            return undefined
          })
        : undefined,
      fetchRuntimeStats(client, statement)
    ])
    const issues = explainPlan ? findPoorPruning(explainPlan) : []
    const slow = slowQueryIssue(runtimeStats, config.slowQueryThresholdMs)
    if (slow) issues.push(slow)
    return { issues, explainPlan, runtimeStats }
  })
}
