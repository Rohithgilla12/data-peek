import { streamText, stepCountIs, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { z } from 'zod'
import { getAdapter } from '../db-adapter'
import type { ConnectionConfig, SchemaInfo, CreateWidgetInput, AIConfig } from '@shared/index'

export interface AgentToolContext {
  connectionConfig: ConnectionConfig
  schemas: SchemaInfo[]
  pendingWidgets: CreateWidgetInput[]
  connectionId: string
}

export function buildAgentSystemPrompt(schemas: SchemaInfo[], dbType: string): string {
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
          const rowCount = table.estimatedRowCount ? ` (~${table.estimatedRowCount} rows)` : ''
          return `  ${table.name}${rowCount}: [${columns}]`
        })
        .join('\n')
      return `Schema "${schema.name}":\n${tables}`
    })
    .join('\n\n')

  const limitClause = dbType === 'mssql' ? 'SELECT TOP N' : 'LIMIT N'

  return `You are an autonomous database analyst agent for a ${dbType} database.

IMPORTANT: You MUST use your tools to accomplish tasks. Do NOT just describe what you would do - actually DO it by calling the tools. You are an agent that takes action, not an assistant that gives advice.

## Your Tools
- execute_query: Execute SQL queries against the database
- get_schema: Get table/column information
- sample_data: Get sample rows to understand data
- create_chart_widget: Create bar/line/pie/area charts
- create_kpi_widget: Create single-value metrics
- create_table_widget: Create data tables
- save_dashboard: Save widgets as a dashboard

## Database Schema
${schemaContext}

## How to Work
When the user asks anything about the data:
1. IMMEDIATELY start using tools - call execute_query or sample_data to explore
2. NEVER just explain what you could do - actually do it
3. Run queries to get real data, then analyze the results
4. Create visualizations if the user wants insights
5. Save as dashboard if multiple widgets are created

You are empowered to take action. Start executing queries right away.

## Tool Usage Guidelines

### execute_query
- SELECT queries run automatically
- INSERT, UPDATE, DELETE, DROP, ALTER require user approval
- Always use ${limitClause} to avoid returning too many rows
- Use table aliases for readability

### create_chart_widget
- bar: comparisons between categories
- line: trends over time (requires date/time column)
- pie: proportions (max 8 items recommended)
- area: cumulative values over time

### create_kpi_widget
- Use for single aggregate values (COUNT, SUM, AVG)
- SQL must return exactly one row with one numeric value
- Choose appropriate format: number, currency, percent, duration

### save_dashboard
- Call this after creating all widgets
- Provide a meaningful name and description

## SQL Guidelines
- Use proper ${dbType} syntax
- Use table aliases for readability
- Be precise with JOINs based on foreign keys
- Always include ${limitClause} clauses
${dbType === 'sqlite' ? '- SQLite: double-quotes for identifiers, 0/1 for booleans' : ''}
${dbType === 'mssql' ? '- MSSQL: Use SELECT TOP N instead of LIMIT' : ''}

## Response Style
- Be concise in explanations
- Show your reasoning process
- Highlight key insights from the data
- If data doesn't match expectations, investigate why`
}

function createModel(config: AIConfig) {
  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return openai(config.model)
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return anthropic(config.model)
    }

    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return google(config.model)
    }

    case 'groq': {
      const groq = createGroq({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return groq(config.model)
    }

    case 'ollama': {
      const ollama = createOpenAI({
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: 'ollama'
      })
      return ollama(config.model)
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

function createAgentTools(ctx: AgentToolContext) {
  return {
    execute_query: tool({
      description:
        'Execute a SQL query against the database. SELECT queries run automatically. INSERT, UPDATE, DELETE, DROP, TRUNCATE, and ALTER queries require user approval.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to execute'),
        reason: z.string().describe('Brief explanation of why this query is needed')
      }),
      execute: async ({ sql, reason }) => {
        const isMutation = /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)/i.test(sql)

        if (isMutation) {
          return {
            requiresApproval: true,
            sql,
            reason,
            message: 'This query modifies data and requires user approval before execution.'
          }
        }

        try {
          const adapter = getAdapter(ctx.connectionConfig)
          const result = await adapter.queryMultiple(ctx.connectionConfig, sql, {})
          const firstResult = result.results[0]

          return {
            success: true,
            rowCount: firstResult?.rowCount ?? 0,
            rows: firstResult?.rows.slice(0, 100) ?? [],
            fields: firstResult?.fields ?? [],
            durationMs: result.totalDurationMs
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Query execution failed'
          }
        }
      }
    }),

    get_schema: tool({
      description:
        'Get database schema information including tables, columns, types, and relationships. Use this to understand the data model before writing queries.',
      inputSchema: z.object({
        tables: z
          .array(z.string())
          .optional()
          .describe('Specific table names to get schema for. If not provided, returns all tables.')
      }),
      execute: async ({ tables }) => {
        const allTables = ctx.schemas.flatMap((schema) =>
          schema.tables.map((table) => ({
            schema: schema.name,
            name: table.name,
            type: table.type,
            columns: table.columns.map((col) => ({
              name: col.name,
              dataType: col.dataType,
              isNullable: col.isNullable,
              isPrimaryKey: col.isPrimaryKey,
              foreignKey: col.foreignKey
                ? `${col.foreignKey.referencedTable}.${col.foreignKey.referencedColumn}`
                : null
            })),
            estimatedRowCount: table.estimatedRowCount
          }))
        )

        if (tables && tables.length > 0) {
          const filtered = allTables.filter((t) =>
            tables.some((name) => t.name.toLowerCase() === name.toLowerCase())
          )
          return { tables: filtered }
        }

        return { tables: allTables }
      }
    }),

    sample_data: tool({
      description:
        'Get sample rows from a table to understand the data shape and typical values. Useful before writing complex queries.',
      inputSchema: z.object({
        table: z.string().describe('Table name to sample from'),
        schema: z.string().optional().describe('Schema name (defaults to public/dbo)'),
        limit: z.number().default(5).describe('Number of sample rows to return (max 20)')
      }),
      execute: async ({ table, schema, limit }) => {
        const safeLimit = Math.min(limit || 5, 20)
        const schemaPrefix = schema ? `"${schema}".` : ''
        const dbType = ctx.connectionConfig.dbType

        let sql: string
        if (dbType === 'mssql') {
          sql = `SELECT TOP ${safeLimit} * FROM ${schemaPrefix}"${table}"`
        } else {
          sql = `SELECT * FROM ${schemaPrefix}"${table}" LIMIT ${safeLimit}`
        }

        try {
          const adapter = getAdapter(ctx.connectionConfig)
          const result = await adapter.queryMultiple(ctx.connectionConfig, sql, {})
          const firstResult = result.results[0]

          return {
            success: true,
            table,
            rows: firstResult?.rows ?? [],
            fields: firstResult?.fields ?? [],
            rowCount: firstResult?.rowCount ?? 0
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to sample data'
          }
        }
      }
    }),

    create_chart_widget: tool({
      description:
        'Create a chart visualization widget for a dashboard. The SQL query will be executed when the dashboard is viewed.',
      inputSchema: z.object({
        title: z.string().describe('Chart title'),
        description: z.string().optional().describe('Chart description'),
        sql: z.string().describe('SQL query that returns data for the chart'),
        chartType: z
          .enum(['bar', 'line', 'pie', 'area'])
          .describe(
            'Chart type: bar for comparisons, line for time trends, pie for proportions (max 8 items), area for cumulative values'
          ),
        xKey: z.string().describe('Column name for X-axis'),
        yKeys: z.array(z.string()).describe('Column name(s) for Y-axis values')
      }),
      execute: async ({ title, description, sql, chartType, xKey, yKeys }) => {
        const widgetId = crypto.randomUUID()

        const widget: CreateWidgetInput = {
          name: title,
          dataSource: {
            type: 'inline',
            sql,
            connectionId: ctx.connectionId
          },
          config: {
            widgetType: 'chart',
            chartType,
            xKey,
            yKeys,
            title,
            description,
            showLegend: yKeys.length > 1,
            showGrid: true
          },
          layout: {
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            minW: 3,
            minH: 2
          },
          aiGenerated: true
        }

        ctx.pendingWidgets.push(widget)

        return {
          success: true,
          widgetId,
          message: `Created ${chartType} chart widget: "${title}"`
        }
      }
    }),

    create_kpi_widget: tool({
      description:
        'Create a KPI/metric widget showing a single value. The SQL query should return exactly one row with one value.',
      inputSchema: z.object({
        label: z.string().describe('Label for the metric (e.g., "Total Revenue", "Active Users")'),
        sql: z.string().describe('SQL query that returns a single value'),
        format: z
          .enum(['number', 'currency', 'percent', 'duration'])
          .describe('How to format the value'),
        valueKey: z.string().describe('Column name containing the value'),
        prefix: z.string().optional().describe('Prefix for display (e.g., "$")'),
        suffix: z.string().optional().describe('Suffix for display (e.g., "%")')
      }),
      execute: async ({ label, sql, format, valueKey, prefix, suffix }) => {
        const widgetId = crypto.randomUUID()

        const widget: CreateWidgetInput = {
          name: label,
          dataSource: {
            type: 'inline',
            sql,
            connectionId: ctx.connectionId
          },
          config: {
            widgetType: 'kpi',
            format,
            label,
            valueKey,
            prefix,
            suffix
          },
          layout: {
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            minW: 2,
            minH: 2
          },
          aiGenerated: true
        }

        ctx.pendingWidgets.push(widget)

        return {
          success: true,
          widgetId,
          message: `Created KPI widget: "${label}"`
        }
      }
    }),

    create_table_widget: tool({
      description: 'Create a table widget showing query results in a tabular format.',
      inputSchema: z.object({
        title: z.string().describe('Table title'),
        sql: z.string().describe('SQL query for the table data'),
        maxRows: z.number().default(50).describe('Maximum rows to display'),
        columns: z
          .array(z.string())
          .optional()
          .describe('Specific columns to show (all if not specified)')
      }),
      execute: async ({ title, sql, maxRows, columns }) => {
        const widgetId = crypto.randomUUID()

        const widget: CreateWidgetInput = {
          name: title,
          dataSource: {
            type: 'inline',
            sql,
            connectionId: ctx.connectionId
          },
          config: {
            widgetType: 'table',
            maxRows: maxRows || 50,
            columns
          },
          layout: {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            minW: 4,
            minH: 2
          },
          aiGenerated: true
        }

        ctx.pendingWidgets.push(widget)

        return {
          success: true,
          widgetId,
          message: `Created table widget: "${title}"`
        }
      }
    }),

    save_dashboard: tool({
      description:
        'Save all created widgets as a dashboard. Call this after creating all the widgets you want to include.',
      inputSchema: z.object({
        name: z.string().describe('Dashboard name'),
        description: z.string().optional().describe('Dashboard description')
      }),
      execute: async ({ name, description }) => {
        if (ctx.pendingWidgets.length === 0) {
          return {
            success: false,
            error:
              'No widgets have been created yet. Create some widgets first using the widget tools.'
          }
        }

        const widgets = calculateLayout(ctx.pendingWidgets)

        return {
          success: true,
          dashboardName: name,
          dashboardDescription: description,
          widgetCount: widgets.length,
          widgets,
          message: `Dashboard "${name}" prepared with ${widgets.length} widget(s). Ready to save.`
        }
      }
    })
  }
}

function calculateLayout(widgets: CreateWidgetInput[]): CreateWidgetInput[] {
  const COLS = 12
  let currentY = 0
  let currentX = 0
  let maxHeightInRow = 0

  return widgets.map((widget) => {
    const w = widget.layout.w
    const h = widget.layout.h

    if (currentX + w > COLS) {
      currentX = 0
      currentY += maxHeightInRow
      maxHeightInRow = 0
    }

    const positioned = {
      ...widget,
      layout: {
        ...widget.layout,
        x: currentX,
        y: currentY
      }
    }

    currentX += w
    maxHeightInRow = Math.max(maxHeightInRow, h)

    return positioned
  })
}

export async function createAgentStream(
  prompt: string,
  aiConfig: AIConfig,
  toolContext: AgentToolContext
) {
  const model = createModel(aiConfig)
  const tools = createAgentTools(toolContext)

  const result = streamText({
    model,
    system: buildAgentSystemPrompt(toolContext.schemas, toolContext.connectionConfig.dbType),
    messages: [{ role: 'user', content: prompt }],
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(20)
  })

  return result
}
