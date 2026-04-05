import mssql from 'mssql'
import type {
  SchemaInfo,
  QueryField,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  RoutineInfo,
  RoutineParameterInfo,
} from '@shared/index'
import type {
  WebDatabaseAdapter,
  WebQueryResult,
  WebExplainResult,
  ConnectionCredentials,
  ActiveQuery,
  TableSizeEntry,
  LockEntry,
  ColumnStatsResult,
} from './types'

function escapeIdentifier(s: string): string {
  return `[${s.replace(/\]/g, ']]')}]`
}

export class MSSQLWebAdapter implements WebDatabaseAdapter {
  private pool: mssql.ConnectionPool | null = null
  private connectionConfig: mssql.config | null = null

  async connect(creds: ConnectionCredentials): Promise<void> {
    this.connectionConfig = {
      server: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      options: {
        encrypt: creds.ssl ?? false,
        trustServerCertificate: true,
        connectTimeout: 10000,
        requestTimeout: 30000,
      },
    }
    this.pool = new mssql.ConnectionPool(this.connectionConfig)
    await this.pool.connect()
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close()
      this.pool = null
    }
  }

  async query(sql: string, timeoutMs = 30000): Promise<WebQueryResult> {
    if (!this.pool) throw new Error('Not connected')

    const request = this.pool.request()
    ;(request as any).timeout = timeoutMs

    const start = performance.now()
    const result = await request.query(sql)
    const durationMs = Math.round(performance.now() - start)

    const recordset = result.recordset || []
    const columns = result.recordset?.columns || {}

    const fields: QueryField[] = Object.entries(columns).map(([name, col]: [string, any]) => ({
      name,
      dataType: mapMssqlType(col.type),
      dataTypeID: col.type?.declaration ?? 0,
    }))

    return {
      rows: recordset as Record<string, unknown>[],
      fields,
      rowCount: result.rowsAffected?.[0] ?? recordset.length,
      durationMs,
    }
  }

  async cancelQuery(): Promise<void> {
    // MSSQL doesn't support cancel in the same way - abort by closing and reconnecting
    if (this.pool && this.connectionConfig) {
      try {
        await this.pool.close()
      } catch {}
      this.pool = new mssql.ConnectionPool(this.connectionConfig)
      await this.pool.connect()
    }
  }

  async execute(
    sql: string,
    timeoutMs = 30000
  ): Promise<{ rowsAffected: number; durationMs: number }> {
    if (!this.pool) throw new Error('Not connected')

    const request = this.pool.request()
    ;(request as any).timeout = timeoutMs

    const start = performance.now()
    const result = await request.query(sql)
    const durationMs = Math.round(performance.now() - start)

    return {
      rowsAffected: result.rowsAffected?.reduce((a, b) => a + b, 0) ?? 0,
      durationMs,
    }
  }

  async explain(sql: string, analyze: boolean): Promise<WebExplainResult> {
    if (!this.pool) throw new Error('Not connected')

    const request = this.pool.request()
    const start = performance.now()

    // MSSQL uses SET SHOWPLAN_ALL or SET STATISTICS PROFILE
    await request.query('SET SHOWPLAN_ALL ON')
    const result = await request.query(sql)
    await request.query('SET SHOWPLAN_ALL OFF')

    const durationMs = Math.round(performance.now() - start)

    return {
      plan: result.recordset || [],
      durationMs,
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) throw new Error('Not connected')

    const [schemasResult, tablesResult, columnsResult, fksResult, routinesResult, paramsResult] =
      await Promise.all([
        this.pool.request().query(`
          SELECT schema_name FROM information_schema.schemata
          WHERE schema_name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
          ORDER BY schema_name
        `),
        this.pool.request().query(`
          SELECT table_schema, table_name, table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
          ORDER BY table_schema, table_name
        `),
        this.pool.request().query(`
          SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
            c.is_nullable, c.column_default, c.ordinal_position,
            c.character_maximum_length, c.numeric_precision, c.numeric_scale,
            CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as is_primary_key
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.table_schema, kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
          ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
          WHERE c.table_schema NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
          ORDER BY c.table_schema, c.table_name, c.ordinal_position
        `),
        this.pool.request().query(`
          SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name,
            ccu.table_schema AS referenced_schema, ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.constraint_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
          ORDER BY tc.table_schema, tc.table_name, kcu.column_name
        `),
        this.pool.request().query(`
          SELECT routine_schema, routine_name, routine_type,
            data_type as return_type, specific_name
          FROM information_schema.routines
          WHERE routine_schema NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
          ORDER BY routine_schema, routine_name
        `),
        this.pool.request().query(`
          SELECT specific_schema, specific_name, parameter_name,
            data_type, parameter_mode, ordinal_position
          FROM information_schema.parameters
          WHERE specific_schema NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
            AND parameter_name IS NOT NULL AND parameter_name != ''
          ORDER BY specific_schema, specific_name, ordinal_position
        `),
      ])

    return buildMssqlSchemaInfo(
      schemasResult.recordset,
      tablesResult.recordset,
      columnsResult.recordset,
      fksResult.recordset,
      routinesResult.recordset,
      paramsResult.recordset
    )
  }

  async getActiveQueries(): Promise<ActiveQuery[]> {
    if (!this.pool) throw new Error('Not connected')
    const result = await this.pool.request().query(`
      SELECT session_id as pid, login_name as [user], status as state,
        DATEDIFF(ms, start_time, GETDATE()) as duration_ms,
        CONVERT(varchar, DATEADD(ms, DATEDIFF(ms, start_time, GETDATE()), 0), 114) as duration,
        text as query
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle)
      WHERE session_id != @@SPID AND status != 'sleeping'
      ORDER BY start_time ASC
    `)
    return result.recordset.map((r: any) => ({
      pid: r.pid,
      user: r.user || '',
      state: r.state || '',
      duration: r.duration || '0s',
      durationMs: r.duration_ms || 0,
      query: r.query || '',
    }))
  }

  async getTableSizes(): Promise<{ dbSize: string; tables: TableSizeEntry[] }> {
    if (!this.pool) throw new Error('Not connected')
    const [dbResult, tablesResult] = await Promise.all([
      this.pool.request().query(`
        SELECT CAST(SUM(size) * 8.0 / 1024 AS DECIMAL(10,2)) as total_size_mb
        FROM sys.database_files
      `),
      this.pool.request().query(`
        SELECT s.name as [schema], t.name as [table],
          p.rows as [rows],
          CAST(SUM(a.total_pages) * 8.0 / 1024 AS DECIMAL(10,2)) as total_size_mb,
          CAST(SUM(a.used_pages) * 8.0 / 1024 AS DECIMAL(10,2)) as data_size_mb,
          CAST((SUM(a.total_pages) - SUM(a.used_pages)) * 8.0 / 1024 AS DECIMAL(10,2)) as index_size_mb,
          SUM(a.total_pages) * 8192 as total_size_bytes
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.indexes i ON t.object_id = i.object_id
        JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        JOIN sys.allocation_units a ON p.partition_id = a.container_id
        WHERE t.is_ms_shipped = 0
        GROUP BY s.name, t.name, p.rows
        ORDER BY SUM(a.total_pages) DESC
      `),
    ])
    return {
      dbSize: `${dbResult.recordset[0]?.total_size_mb || 0} MB`,
      tables: tablesResult.recordset.map((r: any) => ({
        schema: r.schema,
        table: r.table,
        rows: Number(r.rows) || 0,
        dataSize: `${r.data_size_mb} MB`,
        indexSize: `${r.index_size_mb} MB`,
        totalSize: `${r.total_size_mb} MB`,
        totalSizeBytes: Number(r.total_size_bytes) || 0,
      })),
    }
  }

  async getCacheStats(): Promise<{ bufferHitRatio: number; indexHitRatio: number }> {
    if (!this.pool) throw new Error('Not connected')
    const result = await this.pool.request().query(`
      SELECT
        CAST((a.cntr_value * 1.0 / b.cntr_value) * 100 AS DECIMAL(5,2)) as buffer_hit_ratio
      FROM sys.dm_os_performance_counters a
      JOIN sys.dm_os_performance_counters b
        ON a.object_name = b.object_name
      WHERE a.counter_name = 'Buffer cache hit ratio'
        AND b.counter_name = 'Buffer cache hit ratio base'
        AND b.cntr_value > 0
    `)
    const ratio = Number(result.recordset[0]?.buffer_hit_ratio) || 0
    return { bufferHitRatio: ratio, indexHitRatio: ratio }
  }

  async getLocks(): Promise<LockEntry[]> {
    if (!this.pool) throw new Error('Not connected')
    const result = await this.pool.request().query(`
      SELECT
        r.session_id as blocked_pid,
        s1.login_name as blocked_user,
        r.blocking_session_id as blocking_pid,
        s2.login_name as blocking_user,
        r.wait_type as lock_type,
        OBJECT_NAME(r.resource_associated_entity_id) as relation,
        r.wait_time as wait_duration_ms
      FROM sys.dm_exec_requests r
      JOIN sys.dm_exec_sessions s1 ON r.session_id = s1.session_id
      LEFT JOIN sys.dm_exec_sessions s2 ON r.blocking_session_id = s2.session_id
      WHERE r.blocking_session_id != 0
    `)
    return result.recordset.map((r: any) => ({
      blockedPid: r.blocked_pid,
      blockedUser: r.blocked_user || '',
      blockingPid: r.blocking_pid,
      blockingUser: r.blocking_user || '',
      lockType: r.lock_type || '',
      relation: r.relation || '',
      waitDuration: `${Math.round((r.wait_duration_ms || 0) / 1000)}s`,
      waitDurationMs: r.wait_duration_ms || 0,
    }))
  }

  async getColumnStats(
    schema: string,
    table: string,
    column: string,
    dataType: string
  ): Promise<ColumnStatsResult> {
    if (!this.pool) throw new Error('Not connected')
    const ident = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`
    const colIdent = escapeIdentifier(column)

    const [countResult, statsResult, topResult] = await Promise.all([
      this.pool
        .request()
        .query(
          `SELECT COUNT(*) as total, COUNT(*) - COUNT(${colIdent}) as nulls, COUNT(DISTINCT ${colIdent}) as distinct_count FROM ${ident}`
        ),
      this.pool
        .request()
        .query(
          `SELECT MIN(CAST(${colIdent} AS NVARCHAR(MAX))) as min_val, MAX(CAST(${colIdent} AS NVARCHAR(MAX))) as max_val FROM ${ident} WHERE ${colIdent} IS NOT NULL`
        ),
      this.pool
        .request()
        .query(
          `SELECT TOP 10 CAST(${colIdent} AS NVARCHAR(MAX)) as value, COUNT(*) as count FROM ${ident} WHERE ${colIdent} IS NOT NULL GROUP BY ${colIdent} ORDER BY count DESC`
        ),
    ])

    const total = Number(countResult.recordset[0]?.total) || 0
    const nullCount = Number(countResult.recordset[0]?.nulls) || 0
    const distinctCount = Number(countResult.recordset[0]?.distinct_count) || 0

    return {
      totalRows: total,
      nullCount,
      nullPercent: total > 0 ? Math.round((nullCount / total) * 10000) / 100 : 0,
      distinctCount,
      distinctPercent: total > 0 ? Math.round((distinctCount / total) * 10000) / 100 : 0,
      min: statsResult.recordset[0]?.min_val ?? undefined,
      max: statsResult.recordset[0]?.max_val ?? undefined,
      topValues: topResult.recordset.map((r: any) => ({
        value: r.value ?? 'NULL',
        count: Number(r.count),
        percent: total > 0 ? Math.round((Number(r.count) / total) * 10000) / 100 : 0,
      })),
    }
  }
}

function mapMssqlType(type: any): string {
  if (!type) return 'unknown'
  const name = type.declaration || type.name || ''
  const lower = name.toLowerCase()
  if (lower.includes('int')) return 'int'
  if (lower.includes('varchar') || lower.includes('nvarchar') || lower.includes('char')) return 'varchar'
  if (lower.includes('text') || lower.includes('ntext')) return 'text'
  if (lower.includes('decimal') || lower.includes('numeric')) return 'numeric'
  if (lower.includes('float') || lower.includes('real')) return 'float'
  if (lower.includes('datetime') || lower.includes('date')) return 'datetime'
  if (lower.includes('bit')) return 'boolean'
  if (lower.includes('uniqueidentifier')) return 'uuid'
  if (lower.includes('binary') || lower.includes('varbinary')) return 'binary'
  if (lower.includes('money')) return 'money'
  return lower || 'unknown'
}

function buildMssqlSchemaInfo(
  schemas: { schema_name: string }[],
  tables: { table_schema: string; table_name: string; table_type: string }[],
  columns: {
    table_schema: string
    table_name: string
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
    ordinal_position: number
    is_primary_key: number
  }[],
  fks: {
    table_schema: string
    table_name: string
    column_name: string
    constraint_name: string
    referenced_schema: string
    referenced_table: string
    referenced_column: string
  }[],
  routines: {
    routine_schema: string
    routine_name: string
    routine_type: string
    return_type?: string
    specific_name: string
  }[],
  params: {
    specific_schema: string
    specific_name: string
    parameter_name: string
    data_type: string
    parameter_mode: string
    ordinal_position: number
  }[]
): SchemaInfo[] {
  const fkMap = new Map<string, ForeignKeyInfo>()
  for (const fk of fks) {
    fkMap.set(`${fk.table_schema}.${fk.table_name}.${fk.column_name}`, {
      constraintName: fk.constraint_name,
      referencedSchema: fk.referenced_schema,
      referencedTable: fk.referenced_table,
      referencedColumn: fk.referenced_column,
    })
  }

  const paramMap = new Map<string, RoutineParameterInfo[]>()
  for (const p of params) {
    const key = `${p.specific_schema}.${p.specific_name}`
    if (!paramMap.has(key)) paramMap.set(key, [])
    paramMap.get(key)!.push({
      name: p.parameter_name,
      dataType: p.data_type,
      mode: (p.parameter_mode as 'IN' | 'OUT' | 'INOUT') || 'IN',
      ordinalPosition: p.ordinal_position,
    })
  }

  const schemaMap = new Map<string, SchemaInfo>()
  for (const s of schemas) {
    schemaMap.set(s.schema_name, { name: s.schema_name, tables: [], routines: [] })
  }

  const tableMap = new Map<string, TableInfo>()
  for (const t of tables) {
    const schema = schemaMap.get(t.table_schema)
    if (!schema) continue
    const tableType = t.table_type === 'BASE TABLE' ? 'table' : 'view'
    const table: TableInfo = {
      name: t.table_name,
      type: tableType as TableInfo['type'],
      columns: [],
    }
    schema.tables.push(table)
    tableMap.set(`${t.table_schema}.${t.table_name}`, table)
  }

  for (const c of columns) {
    const table = tableMap.get(`${c.table_schema}.${c.table_name}`)
    if (!table) continue
    const fk = fkMap.get(`${c.table_schema}.${c.table_name}.${c.column_name}`)
    const col: ColumnInfo = {
      name: c.column_name,
      dataType: c.data_type,
      isNullable: c.is_nullable === 'YES',
      isPrimaryKey: !!c.is_primary_key,
      defaultValue: c.column_default ?? undefined,
      ordinalPosition: c.ordinal_position,
      foreignKey: fk,
    }
    table.columns.push(col)
  }

  for (const r of routines) {
    const schema = schemaMap.get(r.routine_schema)
    if (!schema) continue
    const rParams = paramMap.get(`${r.routine_schema}.${r.specific_name}`) ?? []
    const routine: RoutineInfo = {
      name: r.routine_name,
      type: r.routine_type === 'FUNCTION' ? 'function' : 'procedure',
      returnType: r.return_type,
      parameters: rParams,
    }
    schema.routines = schema.routines ?? []
    schema.routines.push(routine)
  }

  return Array.from(schemaMap.values())
}
