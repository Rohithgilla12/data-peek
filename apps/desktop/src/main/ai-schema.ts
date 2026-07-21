/**
 * AI response schema, prompt builder, and provider helpers — Pure Module
 *
 * Kept free of Electron / storage / AI-SDK imports so both ai-service (AI SDK
 * path) and harness-service (local CLI path) can share one source of truth for
 * the structured response contract, and so it can be unit-tested in plain node.
 */

import { z } from 'zod'
import type { SchemaInfo, AIStructuredResponse } from '@shared/index'

// Single source of truth for which providers need a key lives in shared.
export { providerNeedsKey } from '@shared/index'

// One widget in an AI-generated dashboard. The model writes read-only SQL per
// widget and picks how to visualise it; the renderer maps this to a real widget.
export const dashboardWidgetSpecSchema = z.object({
  title: z.string().describe('Short widget title'),
  kind: z.enum(['kpi', 'chart', 'table']).describe('Widget kind'),
  sql: z.string().describe('Read-only SQL that produces the widget data'),
  chartType: z.enum(['bar', 'line', 'pie', 'area']).nullish().describe('For kind=chart'),
  format: z.enum(['number', 'currency', 'percent', 'duration']).nullish().describe('For kind=kpi'),
  xKey: z.string().nullish().describe('For kind=chart: category/x column'),
  yKeys: z.array(z.string()).nullish().describe('For kind=chart: value column(s)')
})

export type DashboardWidgetSpec = z.infer<typeof dashboardWidgetSpecSchema>

export const dashboardSpecSchema = z.object({
  title: z.string().describe('Dashboard title'),
  widgets: z.array(dashboardWidgetSpecSchema).min(1).max(8)
})

export type DashboardSpec = z.infer<typeof dashboardSpecSchema>

/**
 * System prompt for generating a whole dashboard. The model should use its DB
 * tools (when available) to ground each widget's SQL in the real schema.
 */
export function buildDashboardPrompt(schemas: SchemaInfo[], dbType: string): string {
  return `${buildSystemPrompt(schemas, dbType)}

## Task: design a dashboard
Design a concise, useful dashboard for this database. Return ONLY a JSON object:
{ "title": string, "widgets": [ { "title", "kind", "sql", "chartType"?, "format"?, "xKey"?, "yKeys"? } ] }

- 4–7 widgets. Lead with 2–4 KPI tiles (kind "kpi": SQL returns a single row/column; set "format"), then 2–3 charts (kind "chart": grouped/time SQL with "chartType", "xKey", and "yKeys"), optionally one "table".
- Every SQL must be READ-ONLY (SELECT), valid for THIS schema, and reference real tables/columns. Prefer meaningful business metrics (counts, revenue, growth, distribution).
- No prose, no markdown fences — the reply must be a single JSON object starting with "{" and ending with "}".`
}

// Zod schema for structured output.
// Flat object (not discriminatedUnion) for Anthropic/OpenAI tool compatibility;
// .nullish() so missing fields are accepted and normalized to null below.
export const responseSchema = z.object({
  type: z
    .enum(['query', 'chart', 'metric', 'schema', 'message', 'report'])
    .describe('Response type'),
  message: z.string().describe('Brief explanation or response message'),
  sql: z.string().nullish().describe('SQL query - for query/chart/metric types'),
  explanation: z.string().nullish().describe('Detailed explanation - for query type'),
  warning: z.string().nullish().describe('Warning for mutations - for query type'),
  requiresConfirmation: z
    .boolean()
    .nullish()
    .describe('True for destructive queries - for query type'),
  title: z.string().nullish().describe('Chart title - for chart type'),
  description: z.string().nullish().describe('Chart description - for chart type'),
  chartType: z
    .enum(['bar', 'line', 'pie', 'area'])
    .nullish()
    .describe('Chart type - for chart type'),
  xKey: z.string().nullish().describe('X-axis column - for chart type'),
  yKeys: z.array(z.string()).nullish().describe('Y-axis columns - for chart type'),
  label: z.string().nullish().describe('Metric label - for metric type'),
  format: z
    .enum(['number', 'currency', 'percent', 'duration'])
    .nullish()
    .describe('Value format - for metric type'),
  tables: z.array(z.string()).nullish().describe('Table names - for schema type'),
  widgets: z
    .array(dashboardWidgetSpecSchema)
    .nullish()
    .describe('For report type: 2-6 widgets (kpi/chart/table), each with read-only SQL'),
  suggestions: z
    .array(z.string())
    .nullish()
    .describe('2-3 short follow-up questions the user might ask next (any type)')
})

/**
 * JSON Schema mirror of {@link responseSchema}, for the CLI's `--json-schema`
 * flag (native structured output). zod v3 has no `toJSONSchema()`, so this is
 * hand-authored and kept in sync by a drift-guard test (its property set must
 * equal the zod schema's). Only `type` + `message` are required; the rest are
 * optional and nullable, matching the `.nullish()` fields above.
 */
export const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'message'],
  properties: {
    type: { type: 'string', enum: ['query', 'chart', 'metric', 'schema', 'message', 'report'] },
    message: { type: 'string' },
    sql: { type: ['string', 'null'] },
    explanation: { type: ['string', 'null'] },
    warning: { type: ['string', 'null'] },
    requiresConfirmation: { type: ['boolean', 'null'] },
    title: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    chartType: { type: ['string', 'null'], enum: ['bar', 'line', 'pie', 'area', null] },
    xKey: { type: ['string', 'null'] },
    yKeys: { type: ['array', 'null'], items: { type: 'string' } },
    label: { type: ['string', 'null'] },
    format: { type: ['string', 'null'], enum: ['number', 'currency', 'percent', 'duration', null] },
    tables: { type: ['array', 'null'], items: { type: 'string' } },
    widgets: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'kind', 'sql'],
        properties: {
          title: { type: 'string' },
          kind: { type: 'string', enum: ['kpi', 'chart', 'table'] },
          sql: { type: 'string' },
          chartType: { type: ['string', 'null'], enum: ['bar', 'line', 'pie', 'area', null] },
          format: {
            type: ['string', 'null'],
            enum: ['number', 'currency', 'percent', 'duration', null]
          },
          xKey: { type: ['string', 'null'] },
          yKeys: { type: ['array', 'null'], items: { type: 'string' } }
        }
      }
    },
    suggestions: { type: ['array', 'null'], items: { type: 'string' } }
  }
} as const

/** Serialized form for the `--json-schema` CLI flag. */
export const RESPONSE_JSON_SCHEMA_STRING = JSON.stringify(RESPONSE_JSON_SCHEMA)

/**
 * Normalize a raw structured response: undefined → null for every optional field,
 * so the renderer always sees a complete object. Shared by both provider paths.
 */
export function normalizeStructuredResponse(
  object: z.infer<typeof responseSchema>
): AIStructuredResponse {
  return {
    ...object,
    sql: object.sql ?? null,
    explanation: object.explanation ?? null,
    warning: object.warning ?? null,
    requiresConfirmation: object.requiresConfirmation ?? null,
    title: object.title ?? null,
    description: object.description ?? null,
    chartType: object.chartType ?? null,
    xKey: object.xKey ?? null,
    yKeys: object.yKeys ?? null,
    label: object.label ?? null,
    format: object.format ?? null,
    tables: object.tables ?? null,
    widgets: object.widgets ?? null,
    suggestions: object.suggestions ?? null
  } as AIStructuredResponse
}

/**
 * Build the system prompt with schema context.
 */
export function buildSystemPrompt(schemas: SchemaInfo[], dbType: string): string {
  const schemaContext = schemas
    .map((schema) => {
      const tables = schema.tables
        .map((table) => {
          const columns = table.columns
            .map((col) => {
              let colDef = `${col.name}: ${col.dataType}`
              if (col.isPrimaryKey) colDef += ' (PK)'
              if (col.foreignKey) {
                colDef += ` -> ${col.foreignKey.referencedTable}.${col.foreignKey.referencedColumn}`
              }
              return colDef
            })
            .join(', ')
          return `  ${table.name}: [${columns}]`
        })
        .join('\n')
      return `Schema "${schema.name}":\n${tables}`
    })
    .join('\n\n')

  return `You are a helpful database assistant for a ${dbType} database.

## Database Schema

${schemaContext}

## Response Format

Set the "type" field and fill ONLY the relevant fields. **IMPORTANT: All fields must be present in the response.** Set unused fields to null (not undefined). Include every field listed below.

### type: "query"
Use when user asks for data or wants to run a query.
- Fill: message, sql, explanation
- Optional: warning, requiresConfirmation (set true for UPDATE/DELETE/DROP/TRUNCATE)
- Null: title, description, chartType, xKey, yKeys, label, format, tables
- Limit results: ${dbType === 'mssql' ? 'Use SELECT TOP 100 for MSSQL' : 'Include LIMIT 100 at the end'} unless user specifies otherwise

### type: "chart"
Use when user asks to visualize, chart, graph, or plot data.
- Fill: message, sql, title, chartType, xKey, yKeys
- Optional: description
- Null: explanation, warning, requiresConfirmation, label, format, tables
- chartType: bar (comparisons), line (time trends), pie (proportions ≤8 items), area (cumulative)

### type: "metric"
Use when user asks for a single KPI/number (total, count, average).
- Fill: message, sql, label, format
- Null: explanation, warning, requiresConfirmation, title, description, chartType, xKey, yKeys, tables
- format: number, currency, percent, or duration

### type: "schema"
Use when user asks about table structure or columns.
- Fill: message, tables
- Null: sql, explanation, warning, requiresConfirmation, title, description, chartType, xKey, yKeys, label, format

### type: "report"
Use when the user asks for an overview/summary/dashboard-like answer that needs
SEVERAL metrics at once (e.g. "give me a business overview", "summarize signups").
- Fill: message (1-2 sentence intro), widgets (2-6 items)
- Each widget: { title, kind ("kpi"|"chart"|"table"), sql (READ-ONLY, valid for THIS
  schema) }. For kind "chart" also set chartType + xKey + yKeys; for "kpi" set format
  (sql returns a single row/column). Lead with KPIs, then charts, optionally a table.
- Null: sql, chartType, xKey, yKeys, label, format, tables (those are for single-widget types)
- Prefer a single "query"/"chart"/"metric" response for one focused ask; only use
  "report" when multiple widgets genuinely help.

### type: "message"
Use for general questions, clarifications, or when no SQL is needed.
- Fill: message
- Null: all other fields (suggestions is still allowed — see below)

### suggestions (any type)
Optionally include "suggestions": 2-3 SHORT (≤6 words) natural next questions the
user is likely to ask given this answer and schema (e.g. "Break down by month",
"Compare to last quarter", "Show as a chart"). Phrase them as prompts the user
would send. Omit (null) if nothing useful comes to mind.

## SQL Guidelines
- Use proper ${dbType} syntax
- Use table aliases for readability
- Quote identifiers if they contain special characters
- Be precise with JOINs based on foreign key relationships${
    dbType === 'sqlite'
      ? `
- SQLite specifics: Use double-quotes for identifiers, booleans are 0/1 integers, no RIGHT JOIN (reverse tables with LEFT JOIN), use COALESCE instead of IFNULL for portability`
      : ''
  }`
}
