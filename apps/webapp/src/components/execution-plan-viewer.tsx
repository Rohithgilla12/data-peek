import { useState, useMemo } from 'react'
import {
  ChevronRight,
  Clock,
  HardDrive,
  Rows3,
  AlertTriangle,
  Activity,
  BarChart3,
  X,
  Zap,
  ArrowUpDown,
  Users,
  Timer,
  TrendingUp,
  Filter,
  Database
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

// PostgreSQL EXPLAIN JSON plan node structure
interface PlanNode {
  'Node Type': string
  'Parallel Aware'?: boolean
  'Async Capable'?: boolean
  'Join Type'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  'Actual Startup Time'?: number
  'Actual Total Time'?: number
  'Actual Rows'?: number
  'Actual Loops'?: number
  Output?: string[]
  Filter?: string
  'Rows Removed by Filter'?: number
  'Index Cond'?: string
  'Index Name'?: string
  'Relation Name'?: string
  Schema?: string
  Alias?: string
  'Hash Cond'?: string
  'Merge Cond'?: string
  'Recheck Cond'?: string
  'Sort Key'?: string[]
  'Sort Method'?: string
  'Sort Space Used'?: number
  'Sort Space Type'?: string
  'Group Key'?: string[]
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Shared Dirtied Blocks'?: number
  'Shared Written Blocks'?: number
  'Local Hit Blocks'?: number
  'Local Read Blocks'?: number
  'Temp Read Blocks'?: number
  'Temp Written Blocks'?: number
  'I/O Read Time'?: number
  'I/O Write Time'?: number
  'Workers Planned'?: number
  'Workers Launched'?: number
  'Heap Fetches'?: number
  'Exact Heap Blocks'?: number
  'Lossy Heap Blocks'?: number
  Plans?: PlanNode[]
}

interface ExplainPlan {
  Plan: PlanNode
  'Planning Time'?: number
  'Execution Time'?: number
  Triggers?: unknown[]
}

interface ExecutionPlanViewerProps {
  plan: ExplainPlan[]
  durationMs: number
  onClose: () => void
}

// Get node type color and icon
function getNodeTypeInfo(nodeType: string): { color: string; bgColor: string } {
  const type = nodeType.toLowerCase()

  if (type.includes('seq scan')) {
    return { color: 'text-orange-500', bgColor: 'bg-orange-500/10' }
  }
  if (type.includes('index') || type.includes('bitmap')) {
    return { color: 'text-green-500', bgColor: 'bg-green-500/10' }
  }
  if (type.includes('hash') || type.includes('merge') || type.includes('nested')) {
    return { color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
  }
  if (type.includes('sort') || type.includes('aggregate') || type.includes('group')) {
    return { color: 'text-purple-500', bgColor: 'bg-purple-500/10' }
  }
  if (type.includes('limit') || type.includes('result')) {
    return { color: 'text-gray-500', bgColor: 'bg-gray-500/10' }
  }

  return { color: 'text-muted-foreground', bgColor: 'bg-muted' }
}

// Calculate the percentage of total cost for a node
function calculateCostPercentage(nodeCost: number, totalCost: number): number {
  if (totalCost === 0) return 0
  return Math.round((nodeCost / totalCost) * 100)
}

// Get progress bar color based on both relative percentage AND absolute time
// Fast queries shouldn't show red even if they take 100% of a tiny total time
function getTimeBarColor(timePercentage: number, actualTimeMs: number): string {
  // If absolute time is very fast (< 10ms), always green
  if (actualTimeMs < 10) {
    return '[&>div]:bg-green-500'
  }

  // If absolute time is reasonably fast (< 100ms), cap at yellow
  if (actualTimeMs < 100) {
    return timePercentage > 50 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'
  }

  // For slower operations, use relative percentage thresholds
  // but with higher absolute time requirements
  if (actualTimeMs > 1000 && timePercentage > 50) {
    return '[&>div]:bg-red-500'
  }

  if (actualTimeMs > 500 && timePercentage > 50) {
    return '[&>div]:bg-yellow-500'
  }

  if (timePercentage > 75 && actualTimeMs > 200) {
    return '[&>div]:bg-yellow-500'
  }

  return '[&>div]:bg-green-500'
}

// Get warning indicators for potential issues
function getNodeWarnings(node: PlanNode): string[] {
  const warnings: string[] = []

  // Check for sequential scans on tables (potential index candidate)
  if (node['Node Type'] === 'Seq Scan' && (node['Actual Rows'] ?? 0) > 1000) {
    warnings.push('Sequential scan on large table - consider adding an index')
  }

  // Check for high filter removals (inefficient filtering)
  if (node['Rows Removed by Filter'] && node['Actual Rows']) {
    const ratio =
      node['Rows Removed by Filter'] / (node['Actual Rows'] + node['Rows Removed by Filter'])
    if (ratio > 0.9) {
      warnings.push('High filter selectivity - index may improve performance')
    }
  }

  // Check for row estimate vs actual mismatch
  if (node['Plan Rows'] && node['Actual Rows']) {
    const estimate = node['Plan Rows']
    const actual = node['Actual Rows']
    if (actual > 0 && (estimate / actual > 10 || actual / estimate > 10)) {
      warnings.push('Row estimate significantly off - consider ANALYZE')
    }
  }

  // Check for sorts spilling to disk
  if (node['Sort Space Type'] === 'Disk') {
    warnings.push('Sort spilling to disk - consider increasing work_mem')
  }

  return warnings
}

// Plan Node Component
function PlanNodeView({
  node,
  depth,
  totalCost,
  maxTime
}: {
  node: PlanNode
  depth: number
  totalCost: number
  maxTime: number
}) {
  const [isOpen, setIsOpen] = useState(depth < 3)
  const { color, bgColor } = getNodeTypeInfo(node['Node Type'])
  const costPercentage = calculateCostPercentage(node['Total Cost'] ?? 0, totalCost)
  const timePercentage = maxTime > 0 ? ((node['Actual Total Time'] ?? 0) / maxTime) * 100 : 0
  const warnings = getNodeWarnings(node)
  const hasChildren = node.Plans && node.Plans.length > 0

  return (
    <div className={cn('relative', depth > 0 && 'ml-6 border-l border-border/50 pl-4')}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="py-1.5">
          <CollapsibleTrigger asChild>
            <button className="group flex items-start gap-2 w-full text-left hover:bg-muted/50 rounded p-1.5 -ml-1.5 transition-colors">
              {hasChildren ? (
                <ChevronRight
                  className={cn(
                    'size-4 mt-0.5 text-muted-foreground transition-transform shrink-0',
                    isOpen && 'rotate-90'
                  )}
                />
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn('font-mono text-xs', color, bgColor)}>
                    {node['Node Type']}
                  </Badge>

                  {node['Relation Name'] && (
                    <span className="text-xs text-muted-foreground">
                      on{' '}
                      <span className="font-medium text-foreground">
                        {node['Schema'] ? `${node['Schema']}.` : ''}
                        {node['Relation Name']}
                      </span>
                      {node['Alias'] && node['Alias'] !== node['Relation Name'] && (
                        <span className="text-muted-foreground"> as {node['Alias']}</span>
                      )}
                    </span>
                  )}

                  {node['Index Name'] && (
                    <span className="text-xs text-muted-foreground">
                      using{' '}
                      <span className="font-medium text-foreground">{node['Index Name']}</span>
                    </span>
                  )}

                  {node['Join Type'] && (
                    <Badge variant="outline" className="text-[10px]">
                      {node['Join Type']}
                    </Badge>
                  )}

                  {node['Parallel Aware'] && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-blue-500 border-blue-500/30"
                    >
                      <Zap className="size-2.5 mr-0.5" />
                      Parallel
                    </Badge>
                  )}

                  {node['Async Capable'] && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-purple-500 border-purple-500/30"
                    >
                      Async
                    </Badge>
                  )}

                  {warnings.length > 0 && <AlertTriangle className="size-3.5 text-yellow-500" />}
                </div>

                {/* Metrics Row - Primary */}
                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  {node['Actual Rows'] !== undefined && (
                    <span className="flex items-center gap-1">
                      <Rows3 className="size-3" />
                      <span className="font-mono">{node['Actual Rows'].toLocaleString()}</span> rows
                      {node['Actual Loops'] && node['Actual Loops'] > 1 && (
                        <span className="text-muted-foreground/70"> x{node['Actual Loops']}</span>
                      )}
                      {/* Show estimate accuracy */}
                      {node['Plan Rows'] !== undefined && node['Actual Rows'] !== undefined && (
                        <span
                          className={cn(
                            'text-[10px]',
                            node['Plan Rows'] === node['Actual Rows']
                              ? 'text-green-500'
                              : Math.abs(node['Plan Rows'] - node['Actual Rows']) /
                                    Math.max(node['Plan Rows'], node['Actual Rows'], 1) >
                                  0.5
                                ? 'text-orange-500'
                                : 'text-muted-foreground/70'
                          )}
                        >
                          (est: {node['Plan Rows'].toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}

                  {node['Actual Total Time'] !== undefined && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      <span className="font-mono">{node['Actual Total Time'].toFixed(2)}</span> ms
                      {/* Show startup time if significant */}
                      {node['Actual Startup Time'] !== undefined &&
                        node['Actual Startup Time'] > 0.1 && (
                          <span className="text-[10px] text-muted-foreground/70">
                            (startup: {node['Actual Startup Time'].toFixed(2)}ms)
                          </span>
                        )}
                    </span>
                  )}

                  {node['Total Cost'] !== undefined && (
                    <span className="flex items-center gap-1">
                      <Activity className="size-3" />
                      cost: <span className="font-mono">{node['Total Cost'].toFixed(0)}</span>
                      <span className="text-muted-foreground/70">({costPercentage}%)</span>
                    </span>
                  )}

                  {/* Parallel workers */}
                  {node['Workers Launched'] !== undefined && node['Workers Launched'] > 0 && (
                    <span className="flex items-center gap-1 text-blue-500">
                      <Users className="size-3" />
                      <span className="font-mono">{node['Workers Launched']}</span>
                      {node['Workers Planned'] &&
                        node['Workers Launched'] < node['Workers Planned'] && (
                          <span className="text-orange-500">/{node['Workers Planned']}</span>
                        )}
                      workers
                    </span>
                  )}
                </div>

                {/* Metrics Row - Secondary (I/O, filters, sort) */}
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                  {/* Buffer stats */}
                  {node['Shared Hit Blocks'] !== undefined && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="size-3" />
                      hits: <span className="font-mono">{node['Shared Hit Blocks']}</span>
                      {node['Shared Read Blocks'] ? (
                        <span className="text-orange-500">reads: {node['Shared Read Blocks']}</span>
                      ) : null}
                      {node['Shared Dirtied Blocks'] ? (
                        <span className="text-yellow-500">
                          dirty: {node['Shared Dirtied Blocks']}
                        </span>
                      ) : null}
                    </span>
                  )}

                  {/* I/O times */}
                  {(node['I/O Read Time'] !== undefined ||
                    node['I/O Write Time'] !== undefined) && (
                    <span className="flex items-center gap-1">
                      <Timer className="size-3" />
                      {node['I/O Read Time'] !== undefined && (
                        <span>
                          read:{' '}
                          <span className="font-mono text-orange-500">
                            {node['I/O Read Time'].toFixed(2)}ms
                          </span>
                        </span>
                      )}
                      {node['I/O Write Time'] !== undefined && (
                        <span>
                          write:{' '}
                          <span className="font-mono text-orange-500">
                            {node['I/O Write Time'].toFixed(2)}ms
                          </span>
                        </span>
                      )}
                    </span>
                  )}

                  {/* Rows removed by filter */}
                  {node['Rows Removed by Filter'] !== undefined &&
                    node['Rows Removed by Filter'] > 0 && (
                      <span className="flex items-center gap-1">
                        <Filter className="size-3" />
                        <span
                          className={cn(
                            'font-mono',
                            node['Rows Removed by Filter'] > (node['Actual Rows'] ?? 0) * 10
                              ? 'text-orange-500'
                              : ''
                          )}
                        >
                          -{node['Rows Removed by Filter'].toLocaleString()}
                        </span>
                        filtered
                      </span>
                    )}

                  {/* Heap fetches for index scans */}
                  {node['Heap Fetches'] !== undefined && (
                    <span className="flex items-center gap-1">
                      <Database className="size-3" />
                      <span className="font-mono">
                        {node['Heap Fetches'].toLocaleString()}
                      </span>{' '}
                      heap fetches
                    </span>
                  )}

                  {/* Temp blocks (spilling to disk) */}
                  {(node['Temp Read Blocks'] !== undefined ||
                    node['Temp Written Blocks'] !== undefined) && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <HardDrive className="size-3" />
                      temp:
                      {node['Temp Read Blocks'] !== undefined && (
                        <span className="font-mono">r:{node['Temp Read Blocks']}</span>
                      )}
                      {node['Temp Written Blocks'] !== undefined && (
                        <span className="font-mono">w:{node['Temp Written Blocks']}</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Sort details */}
                {node['Sort Key'] && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowUpDown className="size-3" />
                    <span className="font-mono text-[11px]">{node['Sort Key'].join(', ')}</span>
                    {node['Sort Method'] && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {node['Sort Method']}
                      </Badge>
                    )}
                    {node['Sort Space Used'] !== undefined && (
                      <span
                        className={cn(
                          'text-[10px]',
                          node['Sort Space Type'] === 'Disk' ? 'text-orange-500' : ''
                        )}
                      >
                        {node['Sort Space Used']}kB {node['Sort Space Type']}
                      </span>
                    )}
                  </div>
                )}

                {/* Group key */}
                {node['Group Key'] && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="size-3" />
                    <span className="text-[10px]">GROUP BY</span>
                    <span className="font-mono text-[11px]">{node['Group Key'].join(', ')}</span>
                  </div>
                )}

                {/* Cost Bar */}
                {timePercentage > 0 && (
                  <div className="mt-1.5 w-full max-w-[200px]">
                    <Progress
                      value={timePercentage}
                      className={cn(
                        'h-1.5',
                        getTimeBarColor(timePercentage, node['Actual Total Time'] ?? 0)
                      )}
                    />
                  </div>
                )}

                {/* Filter/Condition Info */}
                {(node['Filter'] ||
                  node['Index Cond'] ||
                  node['Hash Cond'] ||
                  node['Merge Cond'] ||
                  node['Recheck Cond']) && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded space-y-0.5">
                    {node['Index Cond'] && (
                      <div className="flex gap-2">
                        <span className="text-green-600 dark:text-green-400">Index Cond:</span>
                        <span>{node['Index Cond']}</span>
                      </div>
                    )}
                    {node['Filter'] && (
                      <div className="flex gap-2">
                        <span className="text-blue-600 dark:text-blue-400">Filter:</span>
                        <span>{node['Filter']}</span>
                      </div>
                    )}
                    {node['Recheck Cond'] && (
                      <div className="flex gap-2">
                        <span className="text-purple-600 dark:text-purple-400">Recheck:</span>
                        <span>{node['Recheck Cond']}</span>
                      </div>
                    )}
                    {node['Hash Cond'] && (
                      <div className="flex gap-2">
                        <span className="text-cyan-600 dark:text-cyan-400">Hash Cond:</span>
                        <span>{node['Hash Cond']}</span>
                      </div>
                    )}
                    {node['Merge Cond'] && (
                      <div className="flex gap-2">
                        <span className="text-amber-600 dark:text-amber-400">Merge Cond:</span>
                        <span>{node['Merge Cond']}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 text-[11px] text-yellow-600 dark:text-yellow-500"
                      >
                        <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          {hasChildren && (
            <CollapsibleContent>
              {node.Plans!.map((childNode, index) => (
                <PlanNodeView
                  key={index}
                  node={childNode}
                  depth={depth + 1}
                  totalCost={totalCost}
                  maxTime={maxTime}
                />
              ))}
            </CollapsibleContent>
          )}
        </div>
      </Collapsible>
    </div>
  )
}

export function ExecutionPlanViewer({ plan, durationMs, onClose }: ExecutionPlanViewerProps) {
  const rootPlan = plan[0]?.Plan
  const planningTime = plan[0]?.['Planning Time']
  const executionTime = plan[0]?.['Execution Time']

  // Calculate totals for percentage calculations and aggregate stats
  const stats = useMemo(() => {
    if (!rootPlan)
      return {
        totalCost: 0,
        maxTime: 0,
        totalBufferHits: 0,
        totalBufferReads: 0,
        totalTempBlocks: 0,
        nodeCount: 0,
        hasSeqScan: false,
        hasParallel: false
      }

    let totalBufferHits = 0
    let totalBufferReads = 0
    let totalTempBlocks = 0
    let nodeCount = 0
    let hasSeqScan = false
    let hasParallel = false

    function traverse(node: PlanNode): number {
      nodeCount++
      let max = node['Actual Total Time'] ?? 0

      totalBufferHits += node['Shared Hit Blocks'] ?? 0
      totalBufferReads += node['Shared Read Blocks'] ?? 0
      totalTempBlocks += (node['Temp Read Blocks'] ?? 0) + (node['Temp Written Blocks'] ?? 0)

      if (node['Node Type'] === 'Seq Scan') hasSeqScan = true
      if (node['Parallel Aware'] || (node['Workers Launched'] ?? 0) > 0) hasParallel = true

      if (node.Plans) {
        for (const child of node.Plans) {
          max = Math.max(max, traverse(child))
        }
      }
      return max
    }

    const maxTime = traverse(rootPlan)

    return {
      totalCost: rootPlan['Total Cost'] ?? 0,
      maxTime,
      totalBufferHits,
      totalBufferReads,
      totalTempBlocks,
      nodeCount,
      hasSeqScan,
      hasParallel
    }
  }, [rootPlan])

  const { totalCost, maxTime } = stats

  if (!rootPlan) {
    return (
      <div className="flex flex-col h-full bg-background border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <span className="font-medium text-sm">Query Execution Plan</span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <AlertTriangle className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No execution plan available</p>
              <p className="text-xs text-muted-foreground mt-1">
                The execution plan format may not be supported for this database type.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <span className="font-medium text-sm">Query Execution Plan</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {planningTime !== undefined && (
              <span>
                Planning:{' '}
                <span className="font-mono text-foreground">{planningTime.toFixed(2)}ms</span>
              </span>
            )}
            {executionTime !== undefined && (
              <span>
                Execution:{' '}
                <span className="font-mono text-foreground">{executionTime.toFixed(2)}ms</span>
              </span>
            )}
            <span>
              Total: <span className="font-mono text-foreground">{durationMs}ms</span>
            </span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-4 text-xs shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Activity className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">Cost:</span>
          <span className="font-mono font-medium">{totalCost.toFixed(0)}</span>
        </div>
        {rootPlan['Actual Rows'] !== undefined && (
          <div className="flex items-center gap-1.5">
            <Rows3 className="size-3 text-muted-foreground" />
            <span className="text-muted-foreground">Rows:</span>
            <span className="font-mono font-medium">
              {rootPlan['Actual Rows'].toLocaleString()}
            </span>
          </div>
        )}
        {rootPlan['Plan Width'] !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Width:</span>
            <span className="font-mono font-medium">{rootPlan['Plan Width']}B</span>
          </div>
        )}
        {(stats.totalBufferHits > 0 || stats.totalBufferReads > 0) && (
          <div className="flex items-center gap-1.5">
            <HardDrive className="size-3 text-muted-foreground" />
            <span className="text-muted-foreground">Buffers:</span>
            <span className="font-mono font-medium text-green-600 dark:text-green-400">
              {stats.totalBufferHits.toLocaleString()} hits
            </span>
            {stats.totalBufferReads > 0 && (
              <span className="font-mono font-medium text-orange-500">
                {stats.totalBufferReads.toLocaleString()} reads
              </span>
            )}
          </div>
        )}
        {stats.totalTempBlocks > 0 && (
          <div className="flex items-center gap-1.5 text-orange-500">
            <HardDrive className="size-3" />
            <span>Temp:</span>
            <span className="font-mono font-medium">{stats.totalTempBlocks} blocks</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-muted-foreground">{stats.nodeCount} nodes</span>
          {stats.hasParallel && (
            <Badge variant="outline" className="text-[10px] h-4 text-blue-500 border-blue-500/30">
              <Zap className="size-2 mr-0.5" />
              Parallel
            </Badge>
          )}
          {stats.hasSeqScan && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 text-orange-500 border-orange-500/30"
            >
              Seq Scan
            </Badge>
          )}
        </div>
      </div>

      {/* Plan Tree */}
      <div className="flex-1 overflow-auto p-4">
        <PlanNodeView node={rootPlan} depth={0} totalCost={totalCost} maxTime={maxTime} />
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-border/40 flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1">
          <div className="size-2 rounded bg-orange-500" />
          Seq Scan
        </span>
        <span className="flex items-center gap-1">
          <div className="size-2 rounded bg-green-500" />
          Index Scan
        </span>
        <span className="flex items-center gap-1">
          <div className="size-2 rounded bg-blue-500" />
          Join
        </span>
        <span className="flex items-center gap-1">
          <div className="size-2 rounded bg-purple-500" />
          Sort/Aggregate
        </span>
      </div>
    </div>
  )
}
