import http from 'node:http'
import { getAdapter } from './db-adapter'
import type { ConnectionConfig, SchemaInfo } from '@shared/index'
import { createLogger } from './lib/logger'

const log = createLogger('mcp-server')

let activeHttpServer: http.Server | null = null
let activeConnectionConfig: ConnectionConfig | null = null
let activeSchemas: SchemaInfo[] = []
let activePort: number | null = null

const tools = {
  execute_query: {
    name: 'execute_query',
    description:
      'Execute a SQL query against the connected database. Returns rows and column metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The SQL query to execute' },
        limit: {
          type: 'number',
          description: 'Maximum rows to return (default 100, max 1000)',
          default: 100
        }
      },
      required: ['sql']
    }
  },
  get_schema: {
    name: 'get_schema',
    description:
      'Get database schema information including tables, columns, types, and relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        tables: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific table names to get schema for'
        }
      }
    }
  },
  sample_data: {
    name: 'sample_data',
    description: 'Get sample rows from a table to understand the data shape and typical values.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name to sample from' },
        schema: { type: 'string', description: 'Schema name (defaults to public/dbo)' },
        limit: { type: 'number', description: 'Number of sample rows (max 20)', default: 5 }
      },
      required: ['table']
    }
  },
  get_connection_info: {
    name: 'get_connection_info',
    description: 'Get information about the current database connection.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
}

async function executeQuery(sql: string, limit: number = 100) {
  if (!activeConnectionConfig) {
    return { success: false, error: 'No active database connection' }
  }

  const safeLimit = Math.min(limit || 100, 1000)
  let limitedSql = sql

  if (!/LIMIT\s+\d+/i.test(sql) && !/TOP\s+\d+/i.test(sql)) {
    if (activeConnectionConfig.dbType === 'mssql') {
      limitedSql = sql.replace(/^SELECT/i, `SELECT TOP ${safeLimit}`)
    } else {
      limitedSql = `${sql} LIMIT ${safeLimit}`
    }
  }

  try {
    const adapter = getAdapter(activeConnectionConfig)
    const result = await adapter.queryMultiple(activeConnectionConfig, limitedSql, {})
    const firstResult = result.results[0]

    return {
      success: true,
      rowCount: firstResult?.rowCount ?? 0,
      rows: firstResult?.rows ?? [],
      columns: firstResult?.fields.map((f) => ({ name: f.name, type: f.dataType })) ?? [],
      durationMs: result.totalDurationMs
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Query execution failed'
    }
  }
}

function getSchema(tables?: string[]) {
  const allTables = activeSchemas.flatMap((schema) =>
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

async function sampleData(table: string, schema?: string, limit: number = 5) {
  if (!activeConnectionConfig) {
    return { success: false, error: 'No active database connection' }
  }

  const safeLimit = Math.min(limit || 5, 20)
  const schemaPrefix = schema ? `"${schema}".` : ''
  const dbType = activeConnectionConfig.dbType

  let sql: string
  if (dbType === 'mssql') {
    sql = `SELECT TOP ${safeLimit} * FROM ${schemaPrefix}"${table}"`
  } else {
    sql = `SELECT * FROM ${schemaPrefix}"${table}" LIMIT ${safeLimit}`
  }

  try {
    const adapter = getAdapter(activeConnectionConfig)
    const result = await adapter.queryMultiple(activeConnectionConfig, sql, {})
    const firstResult = result.results[0]

    return {
      success: true,
      table,
      rows: firstResult?.rows ?? [],
      columns: firstResult?.fields.map((f) => ({ name: f.name, type: f.dataType })) ?? [],
      rowCount: firstResult?.rowCount ?? 0
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sample data'
    }
  }
}

function getConnectionInfo() {
  if (!activeConnectionConfig) {
    return { connected: false }
  }

  return {
    connected: true,
    name: activeConnectionConfig.name,
    dbType: activeConnectionConfig.dbType,
    database: activeConnectionConfig.database,
    host: activeConnectionConfig.host,
    tableCount: activeSchemas.reduce((sum, s) => sum + s.tables.length, 0)
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${activePort}`)

  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200)
    res.end(JSON.stringify({ tools: Object.values(tools) }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200)
    res.end(JSON.stringify(getConnectionInfo()))
    return
  }

  if (req.method === 'POST' && url.pathname === '/execute') {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    try {
      const { tool, args } = JSON.parse(body)

      let result: unknown
      switch (tool) {
        case 'execute_query':
          result = await executeQuery(args.sql, args.limit)
          break
        case 'get_schema':
          result = getSchema(args.tables)
          break
        case 'sample_data':
          result = await sampleData(args.table, args.schema, args.limit)
          break
        case 'get_connection_info':
          result = getConnectionInfo()
          break
        default:
          res.writeHead(400)
          res.end(JSON.stringify({ error: `Unknown tool: ${tool}` }))
          return
      }

      res.writeHead(200)
      res.end(JSON.stringify({ result }))
    } catch (error) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
}

export async function startMCPServer(
  connectionConfig: ConnectionConfig,
  schemas: SchemaInfo[],
  port: number = 3100
): Promise<{ success: boolean; port?: number; error?: string }> {
  try {
    if (activeHttpServer) {
      await stopMCPServer()
    }

    activeConnectionConfig = connectionConfig
    activeSchemas = schemas
    activePort = port

    activeHttpServer = http.createServer(handleRequest)

    await new Promise<void>((resolve, reject) => {
      activeHttpServer!.on('error', reject)
      activeHttpServer!.listen(port, () => {
        log.info(`MCP server started on port ${port} for connection: ${connectionConfig.name}`)
        resolve()
      })
    })

    return { success: true, port }
  } catch (error) {
    log.error('Failed to start MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start MCP server'
    }
  }
}

export async function stopMCPServer(): Promise<{ success: boolean; error?: string }> {
  try {
    if (activeHttpServer) {
      await new Promise<void>((resolve, reject) => {
        activeHttpServer!.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      activeHttpServer = null
    }

    activeConnectionConfig = null
    activeSchemas = []
    activePort = null
    log.info('MCP server stopped')

    return { success: true }
  } catch (error) {
    log.error('Failed to stop MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop MCP server'
    }
  }
}

export function getMCPServerStatus(): {
  running: boolean
  port?: number
  connectionId?: string
  connectionName?: string
} {
  return {
    running: !!activeHttpServer,
    port: activePort ?? undefined,
    connectionId: activeConnectionConfig?.id,
    connectionName: activeConnectionConfig?.name
  }
}

export function updateMCPSchemas(schemas: SchemaInfo[]): void {
  activeSchemas = schemas
  log.debug('MCP schemas updated')
}
