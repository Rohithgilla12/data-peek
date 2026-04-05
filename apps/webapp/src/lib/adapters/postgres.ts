import pg from "pg";
import type {
  SchemaInfo,
  QueryField,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  RoutineInfo,
  RoutineParameterInfo,
} from "@shared/index";
import { resolvePostgresType } from "@shared/index";
import type {
  WebDatabaseAdapter,
  WebQueryResult,
  WebExplainResult,
  ConnectionCredentials,
  ActiveQuery,
  TableSizeEntry,
  LockEntry,
  ColumnStatsResult,
} from "./types";

function escapeIdentifier(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export class PostgresWebAdapter implements WebDatabaseAdapter {
  private client: pg.Client | null = null;
  private connectionConfig: pg.ClientConfig | null = null;
  private backendPid: number | null = null;

  async connect(creds: ConnectionCredentials): Promise<void> {
    this.connectionConfig = {
      host: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    };
    this.client = new pg.Client(this.connectionConfig);
    await this.client.connect();
    await this.client.query("SET statement_timeout = 30000");
    const pidResult = await this.client.query("SELECT pg_backend_pid() as pid");
    this.backendPid = pidResult.rows[0]?.pid ?? null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async query(sql: string, timeoutMs = 30000): Promise<WebQueryResult> {
    if (!this.client) throw new Error("Not connected");

    await this.client.query("SET statement_timeout TO $1", [
      Math.min(timeoutMs, 300000),
    ]);

    const start = performance.now();
    const result = await this.client.query(sql);
    const durationMs = Math.round(performance.now() - start);

    const fields: QueryField[] = (result.fields || []).map((f) => ({
      name: f.name,
      dataType: resolvePostgresType(f.dataTypeID),
      dataTypeID: f.dataTypeID,
    }));

    return {
      rows: result.rows || [],
      fields,
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
      durationMs,
    };
  }

  async explain(sql: string, analyze: boolean): Promise<WebExplainResult> {
    if (!this.client) throw new Error("Not connected");

    const start = performance.now();
    const prefix = analyze
      ? "EXPLAIN (ANALYZE, FORMAT JSON)"
      : "EXPLAIN (FORMAT JSON)";
    const result = await this.client.query(`${prefix} ${sql}`);
    const durationMs = Math.round(performance.now() - start);

    return {
      plan: result.rows[0]?.["QUERY PLAN"] ?? result.rows,
      durationMs,
    };
  }

  async cancelQuery(): Promise<void> {
    if (!this.backendPid || !this.connectionConfig) return;
    const cancelClient = new pg.Client(this.connectionConfig);
    try {
      await cancelClient.connect();
      await cancelClient.query("SELECT pg_cancel_backend($1)", [
        this.backendPid,
      ]);
    } finally {
      await cancelClient.end().catch(() => {});
    }
  }

  async execute(
    sql: string,
    timeoutMs = 30000,
  ): Promise<{ rowsAffected: number; durationMs: number }> {
    if (!this.client) throw new Error("Not connected");

    await this.client.query("SET statement_timeout TO $1", [
      Math.min(timeoutMs, 300000),
    ]);

    const start = performance.now();
    const result = await this.client.query(sql);
    const durationMs = Math.round(performance.now() - start);

    return {
      rowsAffected: result.rowCount ?? 0,
      durationMs,
    };
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.client) throw new Error("Not connected");

    const [
      schemasResult,
      tablesResult,
      matViewsResult,
      columnsResult,
      matViewColumnsResult,
      fksResult,
      enumsResult,
      routinesResult,
      paramsResult,
    ] = await Promise.all([
      this.client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND schema_name NOT LIKE 'pg_toast_temp_%'
          AND schema_name NOT LIKE 'pg_temp_%'
        ORDER BY schema_name
      `),
      this.client.query(`
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND table_schema NOT LIKE 'pg_toast_temp_%'
          AND table_schema NOT LIKE 'pg_temp_%'
        ORDER BY table_schema, table_name
      `),
      this.client.query(`
        SELECT schemaname as table_schema, matviewname as table_name, 'MATERIALIZED VIEW' as table_type
        FROM pg_matviews
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND schemaname NOT LIKE 'pg_toast_temp_%'
          AND schemaname NOT LIKE 'pg_temp_%'
        ORDER BY schemaname, matviewname
      `),
      this.client.query(`
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name,
          c.is_nullable, c.column_default, c.ordinal_position, c.character_maximum_length,
          c.numeric_precision, c.numeric_scale,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.table_schema, kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND c.table_schema NOT LIKE 'pg_toast_temp_%'
          AND c.table_schema NOT LIKE 'pg_temp_%'
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `),
      this.client.query(`
        SELECT n.nspname as table_schema, c.relname as table_name, a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, t.typname as udt_name,
          NOT a.attnotnull as is_nullable, pg_get_expr(d.adbin, d.adrelid) as column_default,
          a.attnum as ordinal_position, false as is_primary_key
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
        LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
        WHERE c.relkind = 'm' AND a.attnum > 0 AND NOT a.attisdropped
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname NOT LIKE 'pg_toast_temp_%'
          AND n.nspname NOT LIKE 'pg_temp_%'
        ORDER BY n.nspname, c.relname, a.attnum
      `),
      this.client.query(`
        SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name,
          ccu.table_schema AS referenced_schema, ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND tc.table_schema NOT LIKE 'pg_toast_temp_%'
          AND tc.table_schema NOT LIKE 'pg_temp_%'
        ORDER BY tc.table_schema, tc.table_name, kcu.column_name
      `),
      this.client.query(`
        SELECT n.nspname as schema, t.typname as name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
      `),
      this.client.query(`
        SELECT r.routine_schema, r.routine_name, r.routine_type,
          r.data_type as return_type, r.external_language as language,
          r.specific_name
        FROM information_schema.routines r
        WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND r.routine_schema NOT LIKE 'pg_toast_temp_%'
          AND r.routine_schema NOT LIKE 'pg_temp_%'
        ORDER BY r.routine_schema, r.routine_name
      `),
      this.client.query(`
        SELECT p.specific_schema, p.specific_name, p.parameter_name,
          p.data_type, p.parameter_mode, p.ordinal_position
        FROM information_schema.parameters p
        WHERE p.specific_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND p.specific_schema NOT LIKE 'pg_toast_temp_%'
          AND p.specific_schema NOT LIKE 'pg_temp_%'
          AND p.parameter_name IS NOT NULL
        ORDER BY p.specific_schema, p.specific_name, p.ordinal_position
      `),
    ]);

    return buildSchemaInfo(
      schemasResult.rows,
      [...tablesResult.rows, ...matViewsResult.rows],
      [...columnsResult.rows, ...matViewColumnsResult.rows],
      fksResult.rows,
      enumsResult.rows,
      routinesResult.rows,
      paramsResult.rows,
    );
  }

  async getActiveQueries(): Promise<ActiveQuery[]> {
    if (!this.client) throw new Error("Not connected");
    interface ActiveQueryRow {
      pid: number;
      user: string | null;
      state: string | null;
      duration_ms: number | null;
      duration: string | null;
      query: string | null;
    }
    const result = await this.client.query<ActiveQueryRow>(`
      SELECT pid, usename as user, state,
        EXTRACT(EPOCH FROM (now() - query_start))::int * 1000 as duration_ms,
        now() - query_start as duration,
        query
      FROM pg_stat_activity
      WHERE state != 'idle' AND pid != pg_backend_pid()
      ORDER BY query_start ASC
    `);
    return result.rows.map((r) => ({
      pid: r.pid,
      user: r.user || "",
      state: r.state || "",
      duration: r.duration ? String(r.duration) : "0s",
      durationMs: r.duration_ms || 0,
      query: r.query || "",
    }));
  }

  async getTableSizes(): Promise<{ dbSize: string; tables: TableSizeEntry[] }> {
    if (!this.client) throw new Error("Not connected");
    interface DbSizeRow {
      total_size: string | null;
    }
    interface TableSizeRow {
      schema: string;
      table: string;
      rows: string | number;
      data_size: string;
      index_size: string;
      total_size: string;
      total_size_bytes: string | number;
    }
    const [dbResult, tablesResult] = await Promise.all([
      this.client.query<DbSizeRow>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) as total_size`,
      ),
      this.client.query<TableSizeRow>(`
        SELECT schemaname as schema, relname as table,
          n_live_tup as rows,
          pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as data_size,
          pg_size_pretty(pg_indexes_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as index_size,
          pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as total_size,
          pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) as total_size_bytes
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) DESC
        LIMIT 50
      `),
    ]);
    return {
      dbSize: dbResult.rows[0]?.total_size || "0 bytes",
      tables: tablesResult.rows.map((r) => ({
        schema: r.schema,
        table: r.table,
        rows: Number(r.rows) || 0,
        dataSize: r.data_size,
        indexSize: r.index_size,
        totalSize: r.total_size,
        totalSizeBytes: Number(r.total_size_bytes) || 0,
      })),
    };
  }

  async getCacheStats(): Promise<{
    bufferHitRatio: number;
    indexHitRatio: number;
  }> {
    if (!this.client) throw new Error("Not connected");
    interface CacheStatsRow {
      buffer_hit_ratio: string | number | null;
      index_hit_ratio: string | number | null;
    }
    const result = await this.client.query<CacheStatsRow>(`
      SELECT
        ROUND(COALESCE(SUM(heap_blks_hit)::numeric / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0) * 100, 0), 2) as buffer_hit_ratio,
        ROUND(COALESCE(SUM(idx_blks_hit)::numeric / NULLIF(SUM(idx_blks_hit) + SUM(idx_blks_read), 0) * 100, 0), 2) as index_hit_ratio
      FROM pg_statio_user_tables
    `);
    return {
      bufferHitRatio: Number(result.rows[0]?.buffer_hit_ratio) || 0,
      indexHitRatio: Number(result.rows[0]?.index_hit_ratio) || 0,
    };
  }

  async getLocks(): Promise<LockEntry[]> {
    if (!this.client) throw new Error("Not connected");
    interface LockRow {
      blocked_pid: number;
      blocked_user: string | null;
      blocking_pid: number;
      blocking_user: string | null;
      lock_type: string | null;
      relation: string | null;
      wait_duration: string | null;
      wait_duration_ms: number | null;
    }
    const result = await this.client.query<LockRow>(`
      SELECT
        blocked.pid as blocked_pid,
        blocked_activity.usename as blocked_user,
        blocking.pid as blocking_pid,
        blocking_activity.usename as blocking_user,
        blocked.locktype as lock_type,
        COALESCE(blocked.relation::regclass::text, '') as relation,
        now() - blocked_activity.query_start as wait_duration,
        EXTRACT(EPOCH FROM (now() - blocked_activity.query_start))::int * 1000 as wait_duration_ms
      FROM pg_locks blocked
      JOIN pg_stat_activity blocked_activity ON blocked.pid = blocked_activity.pid
      JOIN pg_locks blocking ON blocking.locktype = blocked.locktype
        AND blocking.database IS NOT DISTINCT FROM blocked.database
        AND blocking.relation IS NOT DISTINCT FROM blocked.relation
        AND blocking.page IS NOT DISTINCT FROM blocked.page
        AND blocking.tuple IS NOT DISTINCT FROM blocked.tuple
        AND blocking.virtualxid IS NOT DISTINCT FROM blocked.virtualxid
        AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
        AND blocking.pid != blocked.pid
      JOIN pg_stat_activity blocking_activity ON blocking.pid = blocking_activity.pid
      WHERE NOT blocked.granted AND blocking.granted
      ORDER BY blocked_activity.query_start ASC
    `);
    return result.rows.map((r) => ({
      blockedPid: r.blocked_pid,
      blockedUser: r.blocked_user || "",
      blockingPid: r.blocking_pid,
      blockingUser: r.blocking_user || "",
      lockType: r.lock_type || "",
      relation: r.relation || "",
      waitDuration: r.wait_duration ? String(r.wait_duration) : "0s",
      waitDurationMs: r.wait_duration_ms || 0,
    }));
  }
  async getColumnStats(
    schema: string,
    table: string,
    column: string,
    dataType: string,
  ): Promise<ColumnStatsResult> {
    if (!this.client) throw new Error("Not connected");
    const ident = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
    const colIdent = escapeIdentifier(column);

    const [countResult, statsResult, topResult] = await Promise.all([
      this.client.query(
        `SELECT COUNT(*) as total, COUNT(*) - COUNT(${colIdent}) as nulls, COUNT(DISTINCT ${colIdent}) as distinct_count FROM ${ident}`,
      ),
      this.client.query(
        `SELECT MIN(${colIdent}::text) as min_val, MAX(${colIdent}::text) as max_val FROM ${ident} WHERE ${colIdent} IS NOT NULL`,
      ),
      this.client.query(
        `SELECT ${colIdent}::text as value, COUNT(*) as count FROM ${ident} WHERE ${colIdent} IS NOT NULL GROUP BY ${colIdent} ORDER BY count DESC LIMIT 10`,
      ),
    ]);

    const total = Number(countResult.rows[0]?.total) || 0;
    const nullCount = Number(countResult.rows[0]?.nulls) || 0;
    const distinctCount = Number(countResult.rows[0]?.distinct_count) || 0;

    return {
      totalRows: total,
      nullCount,
      nullPercent:
        total > 0 ? Math.round((nullCount / total) * 10000) / 100 : 0,
      distinctCount,
      distinctPercent:
        total > 0 ? Math.round((distinctCount / total) * 10000) / 100 : 0,
      min: statsResult.rows[0]?.min_val ?? undefined,
      max: statsResult.rows[0]?.max_val ?? undefined,
      topValues: topResult.rows.map(
        (r: { value: string | null; count: string | number }) => ({
          value: r.value ?? "NULL",
          count: Number(r.count),
          percent:
            total > 0 ? Math.round((Number(r.count) / total) * 10000) / 100 : 0,
        }),
      ),
    };
  }
}

function buildSchemaInfo(
  schemas: { schema_name: string }[],
  tables: { table_schema: string; table_name: string; table_type: string }[],
  columns: {
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name?: string;
    is_nullable: string | boolean;
    column_default: string | null;
    ordinal_position: number;
    is_primary_key: boolean;
  }[],
  fks: {
    table_schema: string;
    table_name: string;
    column_name: string;
    constraint_name: string;
    referenced_schema: string;
    referenced_table: string;
    referenced_column: string;
  }[],
  enums: { schema: string; name: string; values: string[] }[],
  routines: {
    routine_schema: string;
    routine_name: string;
    routine_type: string;
    return_type?: string;
    language?: string;
    specific_name: string;
  }[],
  params: {
    specific_schema: string;
    specific_name: string;
    parameter_name: string;
    data_type: string;
    parameter_mode: string;
    ordinal_position: number;
  }[],
): SchemaInfo[] {
  const fkMap = new Map<string, ForeignKeyInfo>();
  for (const fk of fks) {
    fkMap.set(`${fk.table_schema}.${fk.table_name}.${fk.column_name}`, {
      constraintName: fk.constraint_name,
      referencedSchema: fk.referenced_schema,
      referencedTable: fk.referenced_table,
      referencedColumn: fk.referenced_column,
    });
  }

  const enumMap = new Map<string, string[]>();
  for (const e of enums) {
    enumMap.set(`${e.schema}.${e.name}`, e.values);
  }

  const paramMap = new Map<string, RoutineParameterInfo[]>();
  for (const p of params) {
    const key = `${p.specific_schema}.${p.specific_name}`;
    if (!paramMap.has(key)) paramMap.set(key, []);
    paramMap.get(key)!.push({
      name: p.parameter_name,
      dataType: p.data_type,
      mode: (p.parameter_mode as "IN" | "OUT" | "INOUT") || "IN",
      ordinalPosition: p.ordinal_position,
    });
  }

  const schemaMap = new Map<string, SchemaInfo>();
  for (const s of schemas) {
    schemaMap.set(s.schema_name, {
      name: s.schema_name,
      tables: [],
      routines: [],
    });
  }

  const tableMap = new Map<string, TableInfo>();
  for (const t of tables) {
    const schema = schemaMap.get(t.table_schema);
    if (!schema) continue;
    const tableType =
      t.table_type === "BASE TABLE"
        ? "table"
        : t.table_type === "MATERIALIZED VIEW"
          ? "materialized_view"
          : "view";
    const table: TableInfo = {
      name: t.table_name,
      type: tableType as TableInfo["type"],
      columns: [],
    };
    schema.tables.push(table);
    tableMap.set(`${t.table_schema}.${t.table_name}`, table);
  }

  for (const c of columns) {
    const table = tableMap.get(`${c.table_schema}.${c.table_name}`);
    if (!table) continue;
    const fk = fkMap.get(`${c.table_schema}.${c.table_name}.${c.column_name}`);
    const enumValues = c.udt_name
      ? enumMap.get(`${c.table_schema}.${c.udt_name}`)
      : undefined;
    const col: ColumnInfo = {
      name: c.column_name,
      dataType: c.udt_name || c.data_type,
      isNullable: c.is_nullable === "YES" || c.is_nullable === true,
      isPrimaryKey: !!c.is_primary_key,
      defaultValue: c.column_default ?? undefined,
      ordinalPosition: c.ordinal_position,
      foreignKey: fk,
      enumValues,
    };
    table.columns.push(col);
  }

  for (const r of routines) {
    const schema = schemaMap.get(r.routine_schema);
    if (!schema) continue;
    const params = paramMap.get(`${r.routine_schema}.${r.specific_name}`) ?? [];
    const routine: RoutineInfo = {
      name: r.routine_name,
      type: r.routine_type === "FUNCTION" ? "function" : "procedure",
      returnType: r.return_type,
      parameters: params,
      language: r.language ?? undefined,
    };
    schema.routines = schema.routines ?? [];
    schema.routines.push(routine);
  }

  return Array.from(schemaMap.values());
}
