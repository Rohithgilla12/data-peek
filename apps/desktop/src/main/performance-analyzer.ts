/**
 * Performance Analyzer
 *
 * Analyzes PostgreSQL queries for performance issues:
 * - Missing indexes (via EXPLAIN analysis)
 * - N+1 query patterns (via history analysis)
 * - Slow query warnings
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ConnectionConfig,
  PerformanceAnalysisResult,
  PerformanceAnalysisConfig,
  PerformanceIssue,
  NplusOnePattern,
  QueryHistoryItemForAnalysis
} from '@shared/index'
import { getAdapter } from './db-adapter'
import {
  fingerprintQuery,
  extractWhereInfo,
  isSelectQuery,
  hashFingerprint
} from './lib/query-fingerprint'
import { generateIndexSuggestion } from './lib/index-suggestion'
import { createLogger } from './lib/logger'

const log = createLogger('performance-analyzer')

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  Schema?: string
  Alias?: string
  Filter?: string
  'Index Cond'?: string
  'Index Name'?: string
  'Actual Rows'?: number
  'Plan Rows'?: number
  'Actual Total Time'?: number
  'Total Cost'?: number
  'Startup Cost'?: number
  'Rows Removed by Filter'?: number
  'Sort Key'?: string[]
  'Sort Method'?: string
  'Sort Space Used'?: number
  'Sort Space Type'?: string
  'Hash Buckets'?: number
  'Peak Memory Usage'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Temp Read Blocks'?: number
  'Temp Written Blocks'?: number
  Plans?: PlanNode[]
  [key: string]: unknown
}

interface ExplainPlan {
  Plan: PlanNode
  'Planning Time'?: number
  'Execution Time'?: number
  [key: string]: unknown
}

const DEFAULT_CONFIG: PerformanceAnalysisConfig = {
  slowQueryThresholdMs: 1000,
  nplusOneWindowMs: 5000,
  nplusOneMinOccurrences: 3,
  historyLookbackCount: 50
}

/**
 * Main entry point for performance analysis.
 */
export async function analyzeQueryPerformance(
  connectionConfig: ConnectionConfig,
  query: string,
  queryHistory: QueryHistoryItemForAnalysis[],
  config: Partial<PerformanceAnalysisConfig> = {}
): Promise<PerformanceAnalysisResult> {
  const startTime = performance.now()
  const analysisConfig = { ...DEFAULT_CONFIG, ...config }
  const issues: PerformanceIssue[] = []
  let explainPlan: ExplainPlan | undefined

  log.debug('Starting performance analysis for query')

  // Only analyze SELECT queries for EXPLAIN
  const isSelect = isSelectQuery(query)

  if (isSelect) {
    try {
      // Run EXPLAIN ANALYZE
      const adapter = getAdapter(connectionConfig)
      const explainResult = await adapter.explain(connectionConfig, query, true)

      if (
        explainResult.plan &&
        Array.isArray(explainResult.plan) &&
        explainResult.plan.length > 0 &&
        explainResult.plan[0]?.Plan
      ) {
        explainPlan = explainResult.plan[0] as ExplainPlan

        // Analyze the plan for issues
        const planIssues = analyzePlanTree(explainPlan)
        issues.push(...planIssues)

        // Check for slow query
        const executionTime = explainPlan['Execution Time']
        if (executionTime && executionTime > analysisConfig.slowQueryThresholdMs) {
          issues.push({
            id: uuidv4(),
            type: 'slow_query',
            severity:
              executionTime > analysisConfig.slowQueryThresholdMs * 2 ? 'critical' : 'warning',
            title: 'Slow Query',
            message: `Query took ${executionTime.toFixed(2)}ms to execute, exceeding the ${analysisConfig.slowQueryThresholdMs}ms threshold.`,
            suggestion:
              'Consider optimizing the query by adding indexes, reducing data volume, or simplifying joins.',
            threshold: analysisConfig.slowQueryThresholdMs,
            actualValue: executionTime
          })
        }
      }
    } catch (error) {
      log.error('EXPLAIN failed:', error)
      // Continue with other analysis even if EXPLAIN fails
    }
  }

  // Analyze query history for N+1 patterns
  const nplusOnePatterns = detectNplusOnePatterns(queryHistory, connectionConfig.id, analysisConfig)

  // Convert N+1 patterns to issues
  for (const pattern of nplusOnePatterns) {
    issues.push({
      id: uuidv4(),
      type: 'n_plus_one',
      severity: pattern.occurrences >= 10 ? 'critical' : 'warning',
      title: 'N+1 Query Pattern Detected',
      message: `Similar query executed ${pattern.occurrences} times within ${pattern.timeWindowMs}ms. This pattern often indicates fetching related records in a loop.`,
      suggestion: 'Consider using a JOIN or batch query to fetch all related records at once.',
      tableName: pattern.tableName,
      columnName: pattern.columnName,
      relatedQueries: pattern.querySamples
    })
  }

  // Calculate issue counts
  const issueCount = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length
  }

  const durationMs = performance.now() - startTime

  return {
    queryId: uuidv4(),
    query,
    analyzedAt: Date.now(),
    durationMs,
    issueCount,
    issues,
    nplusOnePatterns,
    explainPlan,
    dbType: 'postgresql',
    connectionId: connectionConfig.id
  }
}

/**
 * Analyze the EXPLAIN plan tree for performance issues.
 */
function analyzePlanTree(plan: ExplainPlan): PerformanceIssue[] {
  const issues: PerformanceIssue[] = []

  function traverseNode(node: PlanNode) {
    // Check for sequential scan
    if (node['Node Type'] === 'Seq Scan') {
      const actualRows = node['Actual Rows'] || 0
      const tableName = node['Relation Name']
      const schema = node['Schema'] || 'public'
      const filter = node['Filter']

      // Flag if scanning many rows with a filter
      if (actualRows > 1000 && filter) {
        const columns = extractColumnsFromFilter(filter)

        issues.push({
          id: uuidv4(),
          type: 'missing_index',
          severity: actualRows > 10000 ? 'critical' : 'warning',
          title: 'Sequential Scan on Large Table',
          message: `Sequential scan on "${tableName}" returned ${actualRows} rows with filter: ${filter}. This can be slow for large tables.`,
          suggestion: 'Consider adding an index on the filtered columns.',
          tableName,
          columnName: columns[0],
          indexSuggestion:
            tableName && columns.length > 0
              ? generateIndexSuggestion(tableName, columns, { schema })
              : undefined,
          planNodeType: 'Seq Scan',
          planNodeDetails: {
            actualRows,
            filter,
            rowsRemovedByFilter: node['Rows Removed by Filter']
          }
        })
      }
    }

    // Check for high filter ratio (many rows filtered out)
    const rowsRemoved = node['Rows Removed by Filter']
    const actualRows = node['Actual Rows'] || 0
    if (rowsRemoved && actualRows > 0 && rowsRemoved > actualRows * 10) {
      const filter = node['Filter']
      const columns = filter ? extractColumnsFromFilter(filter) : []
      const tableName = node['Relation Name']

      issues.push({
        id: uuidv4(),
        type: 'high_filter_ratio',
        severity: rowsRemoved > actualRows * 100 ? 'critical' : 'warning',
        title: 'High Filter Selectivity',
        message: `${rowsRemoved} rows were scanned but filtered out to return only ${actualRows} rows. An index could pre-filter these rows.`,
        suggestion: 'Add an index on the filter columns to avoid scanning and discarding rows.',
        tableName,
        columnName: columns[0],
        indexSuggestion:
          tableName && columns.length > 0 ? generateIndexSuggestion(tableName, columns) : undefined,
        planNodeType: node['Node Type'],
        planNodeDetails: {
          filter,
          rowsRemoved,
          actualRows
        }
      })
    }

    // Check for row estimate mismatch
    const planRows = node['Plan Rows']
    if (planRows && actualRows > 0) {
      const ratio = Math.max(planRows / actualRows, actualRows / planRows)
      if (ratio > 10) {
        issues.push({
          id: uuidv4(),
          type: 'row_estimate_off',
          severity: 'info',
          title: 'Row Estimate Mismatch',
          message: `Planner estimated ${planRows} rows but ${actualRows} were returned. This ${ratio.toFixed(0)}x mismatch can lead to suboptimal plans.`,
          suggestion: 'Run ANALYZE on the table to update statistics.',
          tableName: node['Relation Name'],
          planNodeType: node['Node Type'],
          planNodeDetails: {
            planRows,
            actualRows,
            ratio
          }
        })
      }
    }

    // Check for disk spills (sorts or hash joins)
    if (
      node['Sort Space Type'] === 'Disk' ||
      node['Temp Read Blocks'] ||
      node['Temp Written Blocks']
    ) {
      issues.push({
        id: uuidv4(),
        type: 'disk_spill',
        severity: 'warning',
        title: 'Operation Spilled to Disk',
        message: `${node['Node Type']} operation used disk instead of memory. This significantly slows down the query.`,
        suggestion: 'Consider increasing work_mem or reducing the result set size.',
        planNodeType: node['Node Type'],
        planNodeDetails: {
          sortSpaceType: node['Sort Space Type'],
          sortSpaceUsed: node['Sort Space Used'],
          tempReadBlocks: node['Temp Read Blocks'],
          tempWrittenBlocks: node['Temp Written Blocks']
        }
      })
    }

    // Recurse into child plans
    if (node.Plans) {
      for (const childNode of node.Plans) {
        traverseNode(childNode)
      }
    }
  }

  if (plan.Plan) {
    traverseNode(plan.Plan)
  }

  return issues
}

/**
 * Extract column names from a PostgreSQL filter expression.
 */
function extractColumnsFromFilter(filter: string): string[] {
  const columns: string[] = []

  // Match patterns like: (column_name = value), (table.column = value)
  // Also handles: column_name IS NULL, column_name LIKE 'pattern'
  const matches = filter.matchAll(/\(?\s*(?:\w+\.)?(\w+)\s*(?:=|<|>|<=|>=|<>|!=|~~|!~~|IS\s+)/gi)

  for (const match of matches) {
    const col = match[1]
    // Filter out common false positives
    if (col && !['null', 'true', 'false', 'and', 'or', 'not'].includes(col.toLowerCase())) {
      columns.push(col)
    }
  }

  return [...new Set(columns)]
}

/**
 * Detect N+1 query patterns in recent query history.
 */
function detectNplusOnePatterns(
  history: QueryHistoryItemForAnalysis[],
  connectionId: string,
  config: PerformanceAnalysisConfig
): NplusOnePattern[] {
  const patterns: NplusOnePattern[] = []

  // Filter to recent history for this connection
  const recentHistory = history
    .filter((h) => h.connectionId === connectionId)
    .slice(0, config.historyLookbackCount)
    .filter((h) => isSelectQuery(h.query))

  if (recentHistory.length < config.nplusOneMinOccurrences) {
    return patterns
  }

  // Group queries by fingerprint
  const fingerprintGroups = new Map<
    string,
    { queries: string[]; timestamps: number[]; info: ReturnType<typeof extractWhereInfo> }
  >()

  for (const item of recentHistory) {
    const fp = fingerprintQuery(item.query)
    const hash = hashFingerprint(fp)

    if (!fingerprintGroups.has(hash)) {
      const info = extractWhereInfo(item.query)
      fingerprintGroups.set(hash, {
        queries: [],
        timestamps: [],
        info
      })
    }

    const group = fingerprintGroups.get(hash)!
    group.queries.push(item.query)
    group.timestamps.push(item.timestamp)
  }

  // Find patterns that occur frequently in a short time window
  for (const [hash, group] of fingerprintGroups) {
    if (group.queries.length >= config.nplusOneMinOccurrences) {
      // Check if queries occurred within the time window
      group.timestamps.sort((a, b) => a - b)
      const firstTime = group.timestamps[0]
      const lastTime = group.timestamps[group.timestamps.length - 1]
      const timeWindow = lastTime - firstTime

      if (timeWindow <= config.nplusOneWindowMs || group.queries.length >= 5) {
        patterns.push({
          fingerprint: hash,
          queryTemplate: fingerprintQuery(group.queries[0]),
          occurrences: group.queries.length,
          querySamples: group.queries.slice(0, 3),
          tableName: group.info.tableName,
          columnName: group.info.whereColumns[0],
          timeWindowMs: timeWindow
        })
      }
    }
  }

  // Sort by occurrences (most frequent first)
  patterns.sort((a, b) => b.occurrences - a.occurrences)

  return patterns
}
