# Building a Query Performance Analyzer in Electron

> How we added PlanetScale-style query insights to data-peek, detecting missing indexes and N+1 patterns using PostgreSQL's EXPLAIN ANALYZE.

## The Problem

You write a SQL query. It works. But is it *fast*? Most developers don't know until production slows to a crawl.

Database GUIs show you results, but they rarely tell you:
- "This query is doing a full table scan on 100k rows"
- "You're missing an index on the `status` column"
- "You've run the same query pattern 47 times in the last minute (N+1 alert!)"

We wanted to bring PlanetScale's Query Insights experience to any PostgreSQL database.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer Process                            │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  Tab Query   │  │  Perf Indicator │  │  Issue Cards       │  │
│  │  Editor      │──│  Store (Zustand)│──│  + Panel UI        │  │
│  └──────────────┘  └─────────────────┘  └────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC: db:analyze-performance
┌───────────────────────────┴─────────────────────────────────────┐
│                       Main Process                               │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  Performance │  │  Query          │  │  Index Suggestion  │  │
│  │  Analyzer    │──│  Fingerprinter  │──│  Generator         │  │
│  └──────────────┘  └─────────────────┘  └────────────────────┘  │
│          │                                                       │
│          ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL: EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)│ │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Part 1: Understanding EXPLAIN ANALYZE

PostgreSQL's `EXPLAIN ANALYZE` is incredibly powerful. With the right flags, it tells you exactly what the planner did:

```sql
EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)
SELECT * FROM customers WHERE country = 'USA';
```

The JSON output contains everything we need:

```json
{
  "Plan": {
    "Node Type": "Seq Scan",
    "Relation Name": "customers",
    "Actual Rows": 7142,
    "Actual Total Time": 12.453,
    "Filter": "(country = 'USA'::text)",
    "Rows Removed by Filter": 42858
  },
  "Planning Time": 0.082,
  "Execution Time": 12.512
}
```

Key signals:
- `Node Type: "Seq Scan"` with a `Filter` = potential missing index
- High `Rows Removed by Filter` ratio = inefficient scan
- `Actual Total Time` = actual execution time

## Part 2: The Performance Analyzer Engine

The analyzer walks the EXPLAIN plan tree recursively, flagging issues:

```typescript
interface PerformanceIssue {
  type: 'missing_index' | 'slow_query' | 'n_plus_one' | 'full_table_scan'
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  suggestion?: string
  table?: string
  columns?: string[]
}

function analyzePlanTree(
  node: ExplainNode,
  issues: PerformanceIssue[]
): void {
  // Detect sequential scans with filters
  if (node['Node Type'] === 'Seq Scan' && node['Filter']) {
    const rowsScanned = node['Actual Rows'] + (node['Rows Removed by Filter'] || 0)

    if (rowsScanned > 1000) {
      const columns = extractColumnsFromFilter(node['Filter'])

      issues.push({
        type: 'missing_index',
        severity: rowsScanned > 10000 ? 'critical' : 'warning',
        title: `Sequential scan on ${node['Relation Name']}`,
        description: `Scanned ${rowsScanned.toLocaleString()} rows, removed ${node['Rows Removed by Filter']?.toLocaleString() || 0} by filter`,
        table: node['Relation Name'],
        columns,
        suggestion: generateIndexSuggestion(node['Relation Name'], columns)
      })
    }
  }

  // Recurse into child plans
  if (node['Plans']) {
    for (const child of node['Plans']) {
      analyzePlanTree(child, issues)
    }
  }
}
```

The key insight: **we don't just tell users there's a problem, we give them the fix**.

## Part 3: Index Suggestion Generator

When we detect a missing index, we generate the exact `CREATE INDEX` statement:

```typescript
function generateIndexSuggestion(
  tableName: string,
  columns: string[],
  options?: { schema?: string; concurrently?: boolean }
): string {
  const schema = options?.schema
  const concurrent = options?.concurrently !== false

  const indexName = `idx_${tableName}_${columns.join('_')}`
  const qualifiedTable = schema ? `${schema}.${tableName}` : tableName
  const concurrentlyClause = concurrent ? 'CONCURRENTLY ' : ''

  return `CREATE INDEX ${concurrentlyClause}${indexName} ON ${qualifiedTable} (${columns.join(', ')});`
}
```

We default to `CONCURRENTLY` because:
1. It doesn't lock the table during creation
2. Users can safely run it in production
3. It's what they'd want 99% of the time

## Part 4: N+1 Pattern Detection

The classic N+1 problem: fetch a list, then query each item individually.

```sql
SELECT * FROM orders WHERE customer_id = 1;  -- repeated 100 times
```

We detect this by fingerprinting queries:

```typescript
function fingerprintQuery(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')           // normalize whitespace
    .replace(/'[^']*'/g, '?')       // replace string literals
    .replace(/\b\d+\b/g, '?')       // replace numbers
    .trim()
    .toLowerCase()
}

// "SELECT * FROM orders WHERE customer_id = 1"
// "SELECT * FROM orders WHERE customer_id = 2"
// Both become: "select * from orders where customer_id = ?"
```

Then we look for patterns in recent query history:

```typescript
function detectNplusOnePatterns(
  queryHistory: QueryHistoryItem[],
  threshold: number = 5
): NplusOnePattern[] {
  const patterns = new Map<string, QueryHistoryItem[]>()

  // Group queries by fingerprint
  for (const item of queryHistory) {
    if (!isSelectQuery(item.query)) continue

    const fingerprint = fingerprintQuery(item.query)
    const existing = patterns.get(fingerprint) || []
    existing.push(item)
    patterns.set(fingerprint, existing)
  }

  // Find patterns that repeat suspiciously
  const nplusOnePatterns: NplusOnePattern[] = []

  for (const [fingerprint, queries] of patterns) {
    if (queries.length >= threshold) {
      nplusOnePatterns.push({
        fingerprint,
        count: queries.length,
        sampleQueries: queries.slice(0, 3).map(q => q.query),
        firstSeen: queries[0].timestamp,
        lastSeen: queries[queries.length - 1].timestamp
      })
    }
  }

  return nplusOnePatterns
}
```

## Part 5: IPC Integration

The analyzer runs in the main process (Node.js) where we have database access:

```typescript
// main/ipc/query-handlers.ts
ipcMain.handle('db:analyze-performance', async (_, { config, query, queryHistory, analysisConfig }) => {
  // PostgreSQL only for now
  if (config.dbType && config.dbType !== 'postgresql') {
    return {
      success: false,
      error: 'Performance analysis is currently only supported for PostgreSQL'
    }
  }

  try {
    const result = await analyzeQueryPerformance(
      config,
      query,
      queryHistory,
      analysisConfig
    )
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
```

The preload bridge exposes it safely:

```typescript
// preload/index.ts
analyzePerformance: (config, query, queryHistory, analysisConfig?) =>
  ipcRenderer.invoke('db:analyze-performance', {
    config,
    query,
    queryHistory,
    analysisConfig
  })
```

## Part 6: Frontend State Management

We use Zustand with per-tab state, following our existing patterns:

```typescript
interface TabPerfState {
  isAnalyzing: boolean
  result: PerformanceAnalysisResult | null
  error: string | null
  showPanel: boolean
}

interface PerfIndicatorState {
  tabs: Record<string, TabPerfState>
  setAnalyzing: (tabId: string, analyzing: boolean) => void
  setResult: (tabId: string, result: PerformanceAnalysisResult | null) => void
  setError: (tabId: string, error: string | null) => void
  togglePanel: (tabId: string) => void
  clearTab: (tabId: string) => void
}

export const usePerfIndicatorStore = create<PerfIndicatorState>((set) => ({
  tabs: {},

  setAnalyzing: (tabId, analyzing) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...getDefaultState(), ...state.tabs[tabId], isAnalyzing: analyzing }
      }
    })),

  // ... other actions
}))

// Convenience hook for components
export function useTabPerfIndicator(tabId: string) {
  const store = usePerfIndicatorStore()
  const tabState = store.tabs[tabId] || getDefaultState()

  return {
    ...tabState,
    setAnalyzing: (v: boolean) => store.setAnalyzing(tabId, v),
    setResult: (r: PerformanceAnalysisResult | null) => store.setResult(tabId, r),
    setError: (e: string | null) => store.setError(tabId, e),
    togglePanel: () => store.togglePanel(tabId),
    clearTab: () => store.clearTab(tabId)
  }
}
```

## Part 7: The UI Components

### Issue Card

Each issue gets a card with severity-based styling:

```tsx
function PerfIssueCard({ issue }: { issue: PerformanceIssue }) {
  const severityColors = {
    critical: 'border-red-500/50 bg-red-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    info: 'border-blue-500/50 bg-blue-500/10'
  }

  return (
    <div className={cn('rounded-lg border p-3', severityColors[issue.severity])}>
      <div className="flex items-start gap-2">
        <SeverityIcon severity={issue.severity} />
        <div className="flex-1 space-y-1">
          <p className="font-medium text-sm">{issue.title}</p>
          <p className="text-xs text-muted-foreground">{issue.description}</p>
          {issue.suggestion && (
            <div className="mt-2">
              <code className="text-xs bg-muted px-2 py-1 rounded block">
                {issue.suggestion}
              </code>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(issue.suggestion)}>
                Copy SQL
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### Performance Panel

The panel shows all issues with filtering:

```tsx
function PerfIndicatorPanel({ tabId }: { tabId: string }) {
  const { result, showPanel, togglePanel } = useTabPerfIndicator(tabId)
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(['critical', 'warning', 'info']))

  if (!showPanel || !result) return null

  const filteredIssues = result.issues.filter(i => severityFilter.has(i.severity))

  return (
    <div className="border-t bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <ActivitySquare className="h-4 w-4" />
          Performance Analysis
          <Badge variant="secondary">{result.issues.length} issues</Badge>
        </h3>
        <SeverityFilters value={severityFilter} onChange={setSeverityFilter} />
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredIssues.map((issue, i) => (
          <PerfIssueCard key={i} issue={issue} />
        ))}
      </div>

      {result.nplusOnePatterns.length > 0 && (
        <NplusOneSection patterns={result.nplusOnePatterns} />
      )}
    </div>
  )
}
```

## Part 8: Integration

The "Analyze" button lives in the results footer, next to existing tools:

```tsx
// tab-query-editor.tsx
const handleAnalyzePerformance = useCallback(async () => {
  if (!query.trim() || !connection) return

  perfIndicator.setAnalyzing(true)
  perfIndicator.setError(null)

  try {
    const historyForAnalysis = queryHistory.slice(0, 100).map(h => ({
      query: h.query,
      timestamp: h.timestamp instanceof Date ? h.timestamp.getTime() : h.timestamp,
      duration: h.duration
    }))

    const response = await window.api.db.analyzePerformance(
      connection,
      query,
      historyForAnalysis
    )

    if (response.success && response.data) {
      perfIndicator.setResult(response.data)
      if (!perfIndicator.showPanel) {
        perfIndicator.togglePanel()
      }
    } else {
      perfIndicator.setError(response.error || 'Analysis failed')
    }
  } catch (err) {
    perfIndicator.setError(String(err))
  } finally {
    perfIndicator.setAnalyzing(false)
  }
}, [query, connection, queryHistory, perfIndicator])
```

## File Structure

```
apps/desktop/src/
├── main/
│   ├── lib/
│   │   ├── query-fingerprint.ts    # SQL normalization for N+1 detection
│   │   └── index-suggestion.ts     # CREATE INDEX generator
│   ├── performance-analyzer.ts     # Core analysis engine
│   └── ipc/
│       └── query-handlers.ts       # IPC handler (db:analyze-performance)
├── preload/
│   ├── index.ts                    # API bridge
│   └── index.d.ts                  # Type definitions
└── renderer/src/
    ├── stores/
    │   └── perf-indicator-store.ts # Frontend state
    └── components/
        ├── perf-issue-card.tsx     # Individual issue display
        └── perf-indicator-panel.tsx # Main panel UI

packages/shared/src/
└── index.ts                        # Shared types
```

## Lessons Learned

### 1. EXPLAIN JSON is your friend
PostgreSQL's JSON output format is infinitely easier to parse than the text format. Always use `FORMAT JSON`.

### 2. Generate the fix, not just the warning
Users don't want to figure out index syntax. Give them copy-pasteable `CREATE INDEX` statements.

### 3. CONCURRENTLY by default
Production databases can't afford table locks. Default to `CREATE INDEX CONCURRENTLY`.

### 4. Fingerprinting catches N+1
Simple string normalization (replace literals with `?`) is enough to catch most N+1 patterns.

### 5. Keep analysis on-demand
Auto-running EXPLAIN ANALYZE on every query would be slow and noisy. Let users trigger it when they care.

### 6. Severity levels matter
Not every sequential scan is a crisis. We use row counts to determine severity:
- <1000 rows: ignore
- 1000-10000 rows: warning
- >10000 rows: critical

## What's Next

- [ ] MySQL support (different EXPLAIN format)
- [ ] Index recommendation based on existing indexes
- [ ] Query history trends visualization
- [ ] Export analysis report
- [ ] Suggested query rewrites

---

*This is how we built the performance analyzer in data-peek. The implementation lives in `src/main/performance-analyzer.ts` and `src/renderer/src/components/perf-indicator-panel.tsx`.*
