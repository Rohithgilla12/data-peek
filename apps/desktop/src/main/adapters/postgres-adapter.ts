import { Client } from 'pg'
import type {
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryField,
  ForeignKeyInfo,
  TableDefinition,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  SequenceInfo,
  CustomTypeInfo
} from '@shared/index'
import type { DatabaseAdapter, AdapterQueryResult, ExplainResult } from '../db-adapter'

/**
 * PostgreSQL OID to Type Name Mapping
 * Reference: https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat
 */
const PG_TYPE_MAP: Record<number, string> = {
  16: 'boolean',
  17: 'bytea',
  18: 'char',
  19: 'name',
  20: 'bigint',
  21: 'smallint',
  23: 'integer',
  24: 'regproc',
  25: 'text',
  26: 'oid',
  114: 'json',
  142: 'xml',
  600: 'point',
  601: 'lseg',
  602: 'path',
  603: 'box',
  604: 'polygon',
  628: 'line',
  700: 'real',
  701: 'double precision',
  718: 'circle',
  790: 'money',
  829: 'macaddr',
  869: 'inet',
  650: 'cidr',
  1042: 'char',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1184: 'timestamptz',
  1186: 'interval',
  1266: 'timetz',
  1560: 'bit',
  1562: 'varbit',
  1700: 'numeric',
  2950: 'uuid',
  3802: 'jsonb',
  3904: 'int4range',
  3906: 'numrange',
  3908: 'tsrange',
  3910: 'tstzrange',
  3912: 'daterange',
  3926: 'int8range',
  // Array types (common ones)
  1000: 'boolean[]',
  1001: 'bytea[]',
  1005: 'smallint[]',
  1007: 'integer[]',
  1009: 'text[]',
  1014: 'char[]',
  1015: 'varchar[]',
  1016: 'bigint[]',
  1021: 'real[]',
  1022: 'double precision[]',
  1028: 'oid[]',
  1115: 'timestamp[]',
  1182: 'date[]',
  1183: 'time[]',
  1231: 'numeric[]',
  2951: 'uuid[]',
  3807: 'jsonb[]',
  199: 'json[]'
}

/**
 * Resolve PostgreSQL OID to human-readable type name
 */
function resolvePostgresType(dataTypeID: number): string {
  return PG_TYPE_MAP[dataTypeID] ?? `unknown(${dataTypeID})`
}

/**
 * PostgreSQL database adapter
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly dbType = 'postgresql' as const

  async connect(config: ConnectionConfig): Promise<void> {
    const client = new Client(config)
    await client.connect()
    await client.end()
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const client = new Client(config)
    await client.connect()

    try {
      const res = await client.query(sql)

      const fields: QueryField[] = res.fields.map((f) => ({
        name: f.name,
        dataType: resolvePostgresType(f.dataTypeID),
        dataTypeID: f.dataTypeID
      }))

      return {
        rows: res.rows,
        fields,
        rowCount: res.rowCount
      }
    } finally {
      await client.end()
    }
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const client = new Client(config)
    await client.connect()

    try {
      const res = await client.query(sql, params)
      return { rowCount: res.rowCount }
    } finally {
      await client.end()
    }
  }

  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    const client = new Client(config)
    await client.connect()

    try {
      await client.query('BEGIN')

      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      for (const stmt of statements) {
        const res = await client.query(stmt.sql, stmt.params)
        results.push({ rowCount: res.rowCount })
        rowsAffected += res.rowCount ?? 0
      }

      await client.query('COMMIT')
      return { rowsAffected, results }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      await client.end()
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    const client = new Client(config)
    await client.connect()

    try {
      // Query 1: Get all schemas (excluding system schemas)
      const schemasResult = await client.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name
      `)

      // Query 2: Get all tables and views
      const tablesResult = await client.query(`
        SELECT
          table_schema,
          table_name,
          table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY table_schema, table_name
      `)

      // Query 3: Get all columns with primary key info
      const columnsResult = await client.query(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT
            kcu.table_schema,
            kcu.table_name,
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.table_schema = pk.table_schema
          AND c.table_name = pk.table_name
          AND c.column_name = pk.column_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `)

      // Query 4: Get all foreign key relationships
      const foreignKeysResult = await client.query(`
        SELECT
          tc.table_schema,
          tc.table_name,
          kcu.column_name,
          tc.constraint_name,
          ccu.table_schema AS referenced_schema,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY tc.table_schema, tc.table_name, kcu.column_name
      `)

      // Build foreign key lookup map: "schema.table.column" -> ForeignKeyInfo
      const fkMap = new Map<string, ForeignKeyInfo>()
      for (const row of foreignKeysResult.rows) {
        const key = `${row.table_schema}.${row.table_name}.${row.column_name}`
        fkMap.set(key, {
          constraintName: row.constraint_name,
          referencedSchema: row.referenced_schema,
          referencedTable: row.referenced_table,
          referencedColumn: row.referenced_column
        })
      }

      // Build schema structure
      const schemaMap = new Map<string, SchemaInfo>()

      // Initialize schemas
      for (const row of schemasResult.rows) {
        schemaMap.set(row.schema_name, {
          name: row.schema_name,
          tables: []
        })
      }

      // Build tables map for easy column assignment
      const tableMap = new Map<string, TableInfo>()
      for (const row of tablesResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table: TableInfo = {
          name: row.table_name,
          type: row.table_type === 'VIEW' ? 'view' : 'table',
          columns: []
        }
        tableMap.set(tableKey, table)

        // Add table to its schema
        const schema = schemaMap.get(row.table_schema)
        if (schema) {
          schema.tables.push(table)
        }
      }

      // Assign columns to tables
      for (const row of columnsResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table = tableMap.get(tableKey)
        if (table) {
          // Format data type nicely
          let dataType = row.udt_name
          if (row.character_maximum_length) {
            dataType = `${row.udt_name}(${row.character_maximum_length})`
          } else if (row.numeric_precision && row.numeric_scale) {
            dataType = `${row.udt_name}(${row.numeric_precision},${row.numeric_scale})`
          }

          // Check for foreign key relationship
          const fkKey = `${row.table_schema}.${row.table_name}.${row.column_name}`
          const foreignKey = fkMap.get(fkKey)

          const column: ColumnInfo = {
            name: row.column_name,
            dataType,
            isNullable: row.is_nullable === 'YES',
            isPrimaryKey: row.is_primary_key,
            defaultValue: row.column_default || undefined,
            ordinalPosition: row.ordinal_position,
            foreignKey
          }
          table.columns.push(column)
        }
      }

      return Array.from(schemaMap.values())
    } finally {
      await client.end()
    }
  }

  async explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult> {
    const client = new Client(config)
    await client.connect()

    try {
      const explainOptions = analyze
        ? 'ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON'
        : 'COSTS, VERBOSE, FORMAT JSON'
      const explainQuery = `EXPLAIN (${explainOptions}) ${sql}`

      const start = Date.now()
      const res = await client.query(explainQuery)
      const duration = Date.now() - start

      const planJson = res.rows[0]?.['QUERY PLAN']

      return {
        plan: planJson,
        durationMs: duration
      }
    } finally {
      await client.end()
    }
  }

  async getTableDDL(
    config: ConnectionConfig,
    schema: string,
    table: string
  ): Promise<TableDefinition> {
    const client = new Client(config)
    await client.connect()

    try {
      // Query columns with full metadata
      const columnsResult = await client.query(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.collation_name,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          col_description(
            (quote_ident($1) || '.' || quote_ident($2))::regclass,
            c.ordinal_position
          ) as column_comment
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `,
        [schema, table]
      )

      // Query constraints
      const constraintsResult = await client.query(
        `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_schema AS ref_schema,
          ccu.table_name AS ref_table,
          ccu.column_name AS ref_column,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.constraint_type = 'FOREIGN KEY'
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        LEFT JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = $1 AND tc.table_name = $2
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
        [schema, table]
      )

      // Query indexes - including expression indexes
      const indexesResult = await client.query(
        `
        SELECT
          i.relname as index_name,
          ix.indisunique as is_unique,
          am.amname as index_method,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) FILTER (WHERE a.attname IS NOT NULL) as columns,
          pg_get_expr(ix.indpred, ix.indrelid) as where_clause,
          pg_get_indexdef(i.oid) as index_definition,
          ix.indexprs IS NOT NULL as is_expression_index
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) AND a.attnum > 0
        WHERE n.nspname = $1 AND t.relname = $2
          AND NOT ix.indisprimary  -- Exclude primary key index
        GROUP BY i.relname, ix.indisunique, am.amname, ix.indpred, ix.indrelid, i.oid, ix.indexprs
      `,
        [schema, table]
      )

      // Query table comment
      const tableCommentResult = await client.query(
        `
        SELECT obj_description(
          (quote_ident($1) || '.' || quote_ident($2))::regclass
        ) as comment
      `,
        [schema, table]
      )

      // Build TableDefinition
      const columns: ColumnDefinition[] = columnsResult.rows.map((row, idx) => ({
        id: `col-${idx}`,
        name: row.column_name,
        dataType: row.udt_name,
        length: row.character_maximum_length || undefined,
        precision: row.numeric_precision || undefined,
        scale: row.numeric_scale || undefined,
        isNullable: row.is_nullable === 'YES',
        isPrimaryKey: row.is_primary_key,
        isUnique: false, // Will be set from constraints
        defaultValue: row.column_default || undefined,
        comment: row.column_comment || undefined,
        collation: row.collation_name || undefined
      }))

      // Build constraints from query results
      const constraintMap = new Map<
        string,
        {
          type: string
          columns: string[]
          refSchema?: string
          refTable?: string
          refColumns?: string[]
          onUpdate?: string
          onDelete?: string
          checkExpression?: string
        }
      >()

      for (const row of constraintsResult.rows) {
        const key = row.constraint_name
        if (!constraintMap.has(key)) {
          constraintMap.set(key, {
            type: row.constraint_type,
            columns: [],
            refSchema: row.ref_schema,
            refTable: row.ref_table,
            refColumns: [],
            onUpdate: row.update_rule,
            onDelete: row.delete_rule,
            checkExpression: row.check_clause
          })
        }
        const constraint = constraintMap.get(key)!
        if (row.column_name && !constraint.columns.includes(row.column_name)) {
          constraint.columns.push(row.column_name)
        }
        if (row.ref_column && !constraint.refColumns!.includes(row.ref_column)) {
          constraint.refColumns!.push(row.ref_column)
        }
      }

      const constraints: ConstraintDefinition[] = []
      let constraintIdx = 0
      for (const [name, data] of constraintMap) {
        // Skip primary key (handled at column level)
        if (data.type === 'PRIMARY KEY') continue

        const constraintDef: ConstraintDefinition = {
          id: `constraint-${constraintIdx++}`,
          name,
          type:
            data.type === 'FOREIGN KEY'
              ? 'foreign_key'
              : data.type === 'UNIQUE'
                ? 'unique'
                : data.type === 'CHECK'
                  ? 'check'
                  : 'unique',
          columns: data.columns
        }

        if (data.type === 'FOREIGN KEY') {
          constraintDef.referencedSchema = data.refSchema
          constraintDef.referencedTable = data.refTable
          constraintDef.referencedColumns = data.refColumns
          constraintDef.onUpdate = data.onUpdate as ConstraintDefinition['onUpdate']
          constraintDef.onDelete = data.onDelete as ConstraintDefinition['onDelete']
        }

        if (data.type === 'CHECK') {
          constraintDef.checkExpression = data.checkExpression
        }

        // Mark columns as unique for UNIQUE constraints
        if (data.type === 'UNIQUE' && data.columns.length === 1) {
          const col = columns.find((c) => c.name === data.columns[0])
          if (col) col.isUnique = true
        }

        constraints.push(constraintDef)
      }

      // Build indexes
      const indexes: IndexDefinition[] = indexesResult.rows.map((row, idx) => {
        // Handle columns array - could be null, undefined, or not an array in some cases
        let columnsArray = Array.isArray(row.columns)
          ? row.columns.filter((c: string | null) => c !== null)
          : []

        // For expression indexes, extract the expression from the index definition
        // Format: CREATE INDEX name ON table USING method (expression)
        if (columnsArray.length === 0 && row.is_expression_index && row.index_definition) {
          const match = row.index_definition.match(/USING\s+\w+\s+\((.+)\)(?:\s+WHERE|\s*$)/i)
          if (match) {
            // Use the expression as a single "column"
            columnsArray = [match[1].trim()]
          }
        }

        return {
          id: `index-${idx}`,
          name: row.index_name,
          columns: columnsArray.map((c: string) => ({ name: c })),
          isUnique: row.is_unique,
          method: row.index_method as IndexDefinition['method'],
          where: row.where_clause || undefined
        }
      })

      return {
        schema,
        name: table,
        columns,
        constraints,
        indexes,
        comment: tableCommentResult.rows[0]?.comment || undefined
      }
    } finally {
      await client.end()
    }
  }

  async getSequences(config: ConnectionConfig): Promise<SequenceInfo[]> {
    const client = new Client(config)
    await client.connect()

    try {
      const result = await client.query(`
        SELECT
          schemaname as schema,
          sequencename as name,
          data_type,
          start_value::text,
          increment_by::text as increment
        FROM pg_sequences
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, sequencename
      `)

      return result.rows.map((row) => ({
        schema: row.schema,
        name: row.name,
        dataType: row.data_type,
        startValue: row.start_value,
        increment: row.increment
      }))
    } finally {
      await client.end()
    }
  }

  async getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    const client = new Client(config)
    await client.connect()

    try {
      // Get enum types with their values
      const enumsResult = await client.query(`
        SELECT
          n.nspname as schema,
          t.typname as name,
          'enum' as type_category,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `)

      // Get domain types
      const domainsResult = await client.query(`
        SELECT
          n.nspname as schema,
          t.typname as name,
          'domain' as type_category
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, t.typname
      `)

      return [
        ...enumsResult.rows.map((row) => ({
          schema: row.schema,
          name: row.name,
          type: 'enum' as const,
          values: row.values
        })),
        ...domainsResult.rows.map((row) => ({
          schema: row.schema,
          name: row.name,
          type: 'domain' as const
        }))
      ]
    } finally {
      await client.end()
    }
  }
}
