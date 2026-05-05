import { Client } from 'pg'
import { createWriteStream, type WriteStream } from 'fs'
import type {
  ConnectionConfig,
  PgExportOptions,
  PgExportProgress,
  PgExportResult,
  PgExportPhase
} from '@shared/index'
import { resolvePostgresType } from '@shared/index'
import { buildClientConfig } from './adapters/pg-client-config'
import { createTunnel, closeTunnel, TunnelSession } from './ssh-tunnel-service'
import { escapeSQLValue, escapeSQLIdentifier } from '@shared/sql-escape'
import { createLogger } from './lib/logger'

const log = createLogger('pg-export')

interface CancelToken {
  cancelled: boolean
}

function quoteIdent(name: string): string {
  return escapeSQLIdentifier(name, 'postgresql')
}

function qualifiedName(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`
}

/**
 * Parse a PostgreSQL array literal string like "{val1,val2}" into a JS array.
 * The pg driver sometimes returns array_agg results as raw strings instead of
 * parsed JS arrays.
 */
function parsePostgresArray(value: unknown): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1)
      if (inner === '') return []
      // Simple split by comma, handles basic identifiers
      // For more complex cases with escaped quotes, a more robust parser would be needed
      return inner.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    }
  }
  return []
}

// Excluded system schemas
const SYSTEM_SCHEMAS = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1'
])

function shouldIncludeSchema(schemaName: string, allowedSchemas: string[]): boolean {
  if (SYSTEM_SCHEMAS.has(schemaName)) return false
  if (allowedSchemas.length === 0) return true
  return allowedSchemas.includes(schemaName)
}

function shouldIncludeTable(
  schema: string,
  table: string,
  tables: string[],
  excludeTables: string[]
): boolean {
  const qualified = `${schema}.${table}`
  if (excludeTables.includes(qualified) || excludeTables.includes(table)) return false
  if (tables.length === 0) return true
  return tables.includes(qualified) || tables.includes(table)
}

export async function pgExport(
  config: ConnectionConfig,
  options: PgExportOptions,
  filePath: string,
  onProgress: (progress: PgExportProgress) => void,
  cancelToken: CancelToken
): Promise<PgExportResult> {
  const startTime = Date.now()
  let bytesWritten = 0
  let rowsExported = 0
  let tablesExported = 0
  let tunnelSession: TunnelSession | null = null

  const sendProgress = (
    phase: PgExportPhase,
    currentObject: string,
    objectsProcessed: number,
    totalObjects: number
  ): void => {
    onProgress({
      phase,
      currentObject,
      objectsProcessed,
      totalObjects,
      rowsExported,
      bytesWritten
    })
  }

  if (config.ssh) {
    tunnelSession = await createTunnel(config)
  }
  const tunnelOverrides = tunnelSession
    ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
    : undefined
  const client = new Client(buildClientConfig(config, tunnelOverrides))

  const writable: WriteStream = createWriteStream(filePath, 'utf8')

  function emit(sql: string): void {
    writable.write(sql)
    bytesWritten += Buffer.byteLength(sql, 'utf8')
  }

  try {
    await client.connect()

    sendProgress('preparing', 'Analyzing database...', 0, 0)

    // ── Header ──────────────────────────────────────────────────────────────
    emit(`--\n`)
    emit(`-- data-peek PostgreSQL dump\n`)
    emit(`-- Database: ${config.database}\n`)
    emit(`-- Generated at: ${new Date().toISOString()}\n`)
    emit(`--\n\n`)
    emit(`SET client_encoding = 'UTF8';\n`)
    emit(`SET standard_conforming_strings = on;\n`)
    emit(`SET check_function_bodies = false;\n\n`)

    if (options.includeTransaction) {
      emit(`BEGIN;\n\n`)
    }

    // ── 1. Custom Types (ENUMs, composites, domains, ranges) ────────────────
    if (options.includeTypes && options.mode !== 'data-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('types', 'Exporting types...', 0, 0)

      // ENUMs
      const enumsResult = await client.query(`
        SELECT n.nspname as schema, t.typname as name,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) as labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typtype = 'e'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `)

      for (const row of enumsResult.rows) {
        if (!shouldIncludeSchema(row.schema, options.schemas)) continue
        if (options.includeDropStatements) {
          emit(`DROP TYPE IF EXISTS ${qualifiedName(row.schema, row.name)} CASCADE;\n`)
        }
        const labels = parsePostgresArray(row.labels)
          .map((l: string) => `'${l.replace(/'/g, "''")}'`)
          .join(', ')
        emit(`CREATE TYPE ${qualifiedName(row.schema, row.name)} AS ENUM (${labels});\n\n`)
      }

      // Domains
      const domainsResult = await client.query(`
        SELECT n.nspname as schema, t.typname as name,
               pg_catalog.format_type(t.typbasetype, t.typtypmod) as base_type,
               t.typnotnull as not_null,
               t.typdefault as default_value,
               (SELECT string_agg(pg_get_constraintdef(c.oid), ' ') FROM pg_constraint c WHERE c.contypid = t.oid) as constraints
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, t.typname
      `)

      for (const row of domainsResult.rows) {
        if (!shouldIncludeSchema(row.schema, options.schemas)) continue
        if (options.includeDropStatements) {
          emit(`DROP DOMAIN IF EXISTS ${qualifiedName(row.schema, row.name)} CASCADE;\n`)
        }
        let domainSql = `CREATE DOMAIN ${qualifiedName(row.schema, row.name)} AS ${row.base_type}`
        if (row.not_null) domainSql += ' NOT NULL'
        if (row.default_value) domainSql += ` DEFAULT ${row.default_value}`
        if (row.constraints) domainSql += ` ${row.constraints}`
        emit(`${domainSql};\n\n`)
      }

      // Composite types
      const compositesResult = await client.query(`
        SELECT n.nspname as schema, t.typname as name,
               array_agg(a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum) as attrs
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_class c ON c.oid = t.typrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE t.typtype = 'c'
          AND c.relkind = 'c'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `)

      for (const row of compositesResult.rows) {
        if (!shouldIncludeSchema(row.schema, options.schemas)) continue
        if (options.includeDropStatements) {
          emit(`DROP TYPE IF EXISTS ${qualifiedName(row.schema, row.name)} CASCADE;\n`)
        }
        const attrs = parsePostgresArray(row.attrs).join(',\n  ')
        emit(`CREATE TYPE ${qualifiedName(row.schema, row.name)} AS (\n  ${attrs}\n);\n\n`)
      }
    }

    // ── 2. Sequences ────────────────────────────────────────────────────────
    if (options.includeSequences && options.mode !== 'data-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('sequences', 'Exporting sequences...', 0, 0)

      const seqResult = await client.query(`
        SELECT schemaname as schema, sequencename as name,
               data_type, start_value::text, increment_by::text as increment,
               min_value::text, max_value::text, cache_size::text as cache,
               cycle as is_cycle
        FROM pg_sequences
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, sequencename
      `)

      for (const row of seqResult.rows) {
        if (!shouldIncludeSchema(row.schema, options.schemas)) continue
        if (options.includeDropStatements) {
          emit(`DROP SEQUENCE IF EXISTS ${qualifiedName(row.schema, row.name)} CASCADE;\n`)
        }
        let seqSql = `CREATE SEQUENCE ${qualifiedName(row.schema, row.name)}`
        if (row.data_type && row.data_type !== 'bigint') seqSql += ` AS ${row.data_type}`
        seqSql += ` INCREMENT BY ${row.increment}`
        seqSql += ` MINVALUE ${row.min_value}`
        seqSql += ` MAXVALUE ${row.max_value}`
        seqSql += ` START WITH ${row.start_value}`
        seqSql += ` CACHE ${row.cache}`
        if (row.is_cycle) seqSql += ' CYCLE'
        else seqSql += ' NO CYCLE'
        emit(`${seqSql};\n\n`)
      }
    }

    // ── 3. Tables (without FKs) ─────────────────────────────────────────────
    // Collect tables to export, their FK constraints, and indexes
    interface TableEntry {
      schema: string
      name: string
    }

    const tablesToExport: TableEntry[] = []
    const deferredFKs: string[] = []
    const deferredIndexes: string[] = []
    const sequenceSetvals: string[] = []

    if (options.mode !== 'data-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      // Get all regular tables
      const tablesResult = await client.query(`
        SELECT schemaname as schema, tablename as name
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schemaname, tablename
      `)

      const filteredTables = tablesResult.rows.filter(
        (t) =>
          shouldIncludeSchema(t.schema, options.schemas) &&
          shouldIncludeTable(t.schema, t.name, options.tables, options.excludeTables)
      )

      sendProgress('tables', 'Exporting tables...', 0, filteredTables.length)

      for (let i = 0; i < filteredTables.length; i++) {
        if (cancelToken.cancelled) throw new Error('Export cancelled')

        const table = filteredTables[i]
        const qName = qualifiedName(table.schema, table.name)

        sendProgress('tables', qName, i, filteredTables.length)

        tablesToExport.push({ schema: table.schema, name: table.name })

        if (options.includeDropStatements) {
          emit(`DROP TABLE IF EXISTS ${qName} CASCADE;\n`)
        }

        // Get column definitions
        const colsResult = await client.query(
          `
          SELECT
            c.column_name, c.data_type, c.udt_name, c.is_nullable,
            c.column_default, c.character_maximum_length,
            c.numeric_precision, c.numeric_scale, c.collation_name,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
          ) pk ON c.column_name = pk.column_name
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position
        `,
          [table.schema, table.name]
        )

        const colDefs: string[] = []
        for (const col of colsResult.rows) {
          let typeName = col.udt_name
          // Handle array types
          if (col.data_type === 'ARRAY') {
            typeName = col.udt_name.replace(/^_/, '') + '[]'
          } else if (col.character_maximum_length) {
            typeName = `${col.udt_name}(${col.character_maximum_length})`
          } else if (
            col.numeric_precision &&
            col.udt_name === 'numeric' &&
            col.numeric_scale !== null
          ) {
            typeName = `numeric(${col.numeric_precision}, ${col.numeric_scale})`
          }

          let colSql = `  ${quoteIdent(col.column_name)} ${typeName}`
          if (col.collation_name && col.collation_name !== 'default') {
            colSql += ` COLLATE "${col.collation_name}"`
          }
          if (col.column_default !== null) colSql += ` DEFAULT ${col.column_default}`
          if (col.is_nullable === 'NO') colSql += ' NOT NULL'
          colDefs.push(colSql)
        }

        // Get PK constraint
        const pkResult = await client.query(
          `
          SELECT tc.constraint_name,
                 array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
          GROUP BY tc.constraint_name
        `,
          [table.schema, table.name]
        )

        for (const pk of pkResult.rows) {
          const pkCols = parsePostgresArray(pk.columns).map(quoteIdent).join(', ')
          colDefs.push(`  CONSTRAINT ${quoteIdent(pk.constraint_name)} PRIMARY KEY (${pkCols})`)
        }

        // Get UNIQUE constraints (not FK, not PK)
        const uniqueResult = await client.query(
          `
          SELECT tc.constraint_name,
                 array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1 AND tc.table_name = $2
          GROUP BY tc.constraint_name
        `,
          [table.schema, table.name]
        )

        for (const u of uniqueResult.rows) {
          const uCols = parsePostgresArray(u.columns).map(quoteIdent).join(', ')
          colDefs.push(`  CONSTRAINT ${quoteIdent(u.constraint_name)} UNIQUE (${uCols})`)
        }

        // Get CHECK constraints
        const checkResult = await client.query(
          `
          SELECT tc.constraint_name, cc.check_clause
          FROM information_schema.table_constraints tc
          JOIN information_schema.check_constraints cc
            ON tc.constraint_name = cc.constraint_name
          WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = $1 AND tc.table_name = $2
            AND tc.constraint_name NOT LIKE '%_not_null'
        `,
          [table.schema, table.name]
        )

        for (const chk of checkResult.rows) {
          colDefs.push(
            `  CONSTRAINT ${quoteIdent(chk.constraint_name)} CHECK (${chk.check_clause})`
          )
        }

        emit(`CREATE TABLE ${qName} (\n${colDefs.join(',\n')}\n);\n\n`)

        // Get table comment
        const commentResult = await client.query(
          `SELECT obj_description((quote_ident($1) || '.' || quote_ident($2))::regclass) as comment`,
          [table.schema, table.name]
        )
        if (commentResult.rows[0]?.comment) {
          const escaped = commentResult.rows[0].comment.replace(/'/g, "''")
          emit(`COMMENT ON TABLE ${qName} IS '${escaped}';\n\n`)
        }

        // Get column comments
        const colCommentsResult = await client.query(
          `
          SELECT a.attname, col_description(c.oid, a.attnum) as comment
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
            AND col_description(c.oid, a.attnum) IS NOT NULL
        `,
          [table.schema, table.name]
        )

        for (const cc of colCommentsResult.rows) {
          const escaped = cc.comment.replace(/'/g, "''")
          emit(`COMMENT ON COLUMN ${qName}.${quoteIdent(cc.attname)} IS '${escaped}';\n`)
        }
        if (colCommentsResult.rows.length > 0) emit('\n')

        // Collect FK constraints (deferred)
        const fkResult = await client.query(
          `
          SELECT conname, pg_get_constraintdef(oid) as def
          FROM pg_constraint
          WHERE conrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
            AND contype = 'f'
        `,
          [table.schema, table.name]
        )

        for (const fk of fkResult.rows) {
          deferredFKs.push(
            `ALTER TABLE ${qName} ADD CONSTRAINT ${quoteIdent(fk.conname)} ${fk.def};`
          )
        }

        // Collect indexes (deferred)
        const indexResult = await client.query(
          `
          SELECT indexrelid::regclass::text as index_name, pg_get_indexdef(indexrelid) as def
          FROM pg_index
          WHERE indrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
            AND NOT indisprimary AND NOT indisunique
        `,
          [table.schema, table.name]
        )

        for (const idx of indexResult.rows) {
          deferredIndexes.push(`${idx.def};`)
        }

        // Collect unique index definitions that aren't tied to constraints (deferred)
        const uniqueIdxResult = await client.query(
          `
          SELECT pg_get_indexdef(i.indexrelid) as def
          FROM pg_index i
          LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
          WHERE i.indrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
            AND NOT i.indisprimary AND i.indisunique AND c.oid IS NULL
        `,
          [table.schema, table.name]
        )

        for (const idx of uniqueIdxResult.rows) {
          deferredIndexes.push(`${idx.def};`)
        }

        // Collect sequence setvals for serial/identity columns
        for (const col of colsResult.rows) {
          if (col.column_default && col.column_default.startsWith('nextval(')) {
            const seqMatch = col.column_default.match(/nextval\('([^']+)'/)
            if (seqMatch) {
              sequenceSetvals.push(seqMatch[1])
            }
          }
        }

        tablesExported++
      }
    } else {
      // data-only mode: still need to figure out which tables to export data from
      const tablesResult = await client.query(`
        SELECT schemaname as schema, tablename as name
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schemaname, tablename
      `)

      for (const t of tablesResult.rows) {
        if (
          shouldIncludeSchema(t.schema, options.schemas) &&
          shouldIncludeTable(t.schema, t.name, options.tables, options.excludeTables)
        ) {
          tablesToExport.push({ schema: t.schema, name: t.name })
        }
      }
    }

    // ── 4. Table data (INSERT statements via cursor) ────────────────────────
    if (options.mode !== 'schema-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('data', 'Exporting data...', 0, tablesToExport.length)

      // Get row count estimates for progress
      const countEstimates = new Map<string, number>()
      for (const t of tablesToExport) {
        const res = await client.query(
          `SELECT reltuples::bigint as estimate FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`,
          [t.schema, t.name]
        )
        const est = Number(res.rows[0]?.estimate ?? 0)
        countEstimates.set(`${t.schema}.${t.name}`, Math.max(est, 0))
      }

      for (let i = 0; i < tablesToExport.length; i++) {
        if (cancelToken.cancelled) throw new Error('Export cancelled')

        const table = tablesToExport[i]
        const qName = qualifiedName(table.schema, table.name)

        sendProgress('data', qName, i, tablesToExport.length)

        // Use a cursor for streaming large tables
        const batchSize = Math.max(
          1,
          Math.min(10000, Math.floor(Number(options.dataBatchSize) || 100))
        )
        await client.query('BEGIN')
        const cursorName = 'export_cursor'
        await client.query(`DECLARE ${cursorName} CURSOR FOR SELECT * FROM ${qName}`)

        // Get field metadata from first fetch
        let fieldNames: string[] | null = null
        let fieldTypes: string[] | null = null
        let hasRows = true

        while (hasRows) {
          if (cancelToken.cancelled) {
            await client.query('CLOSE ' + cursorName)
            await client.query('ROLLBACK')
            throw new Error('Export cancelled')
          }

          const fetchResult = await client.query(`FETCH ${batchSize} FROM ${cursorName}`)

          if (fetchResult.rows.length === 0) {
            hasRows = false
            break
          }

          // Initialize field metadata on first batch
          if (!fieldNames) {
            fieldNames = fetchResult.fields.map((f) => f.name)
            fieldTypes = fetchResult.fields.map((f) => resolvePostgresType(f.dataTypeID))
            emit(`--\n-- Data for table ${qName}\n--\n\n`)
          }

          // Generate INSERT statements
          const colList = fieldNames!.map(quoteIdent).join(', ')
          const valueRows: string[] = []

          for (const row of fetchResult.rows) {
            const values = fieldNames!.map((name, idx) =>
              escapeSQLValue(row[name], fieldTypes![idx], 'postgresql')
            )
            valueRows.push(`(${values.join(', ')})`)
            rowsExported++
          }

          emit(`INSERT INTO ${qName} (${colList})\nVALUES ${valueRows.join(',\n       ')};\n\n`)

          sendProgress('data', qName, i, tablesToExport.length)
        }

        await client.query('CLOSE ' + cursorName)
        await client.query('COMMIT')
      }
    }

    // ── 5. Sequence setvals (restore current values) ────────────────────────
    if (options.mode !== 'data-only' && options.includeSequences && sequenceSetvals.length > 0) {
      emit(`--\n-- Sequence values\n--\n\n`)
      for (const seqName of sequenceSetvals) {
        try {
          const valResult = await client.query(`SELECT last_value, is_called FROM ${seqName}`)
          if (valResult.rows.length > 0) {
            const { last_value, is_called } = valResult.rows[0]
            emit(
              `SELECT pg_catalog.setval('${seqName.replace(/'/g, "''")}', ${last_value}, ${is_called});\n`
            )
          }
        } catch {
          // Sequence might not be readable, skip
        }
      }
      emit('\n')
    }

    // ── 6. Indexes ──────────────────────────────────────────────────────────
    if (options.mode !== 'data-only' && deferredIndexes.length > 0) {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('indexes', 'Creating indexes...', 0, deferredIndexes.length)

      emit(`--\n-- Indexes\n--\n\n`)
      for (const idx of deferredIndexes) {
        emit(`${idx}\n`)
      }
      emit('\n')
    }

    // ── 7. Foreign keys ─────────────────────────────────────────────────────
    if (options.mode !== 'data-only' && deferredFKs.length > 0) {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('foreign_keys', 'Adding foreign keys...', 0, deferredFKs.length)

      emit(`--\n-- Foreign keys\n--\n\n`)
      for (const fk of deferredFKs) {
        emit(`${fk}\n`)
      }
      emit('\n')
    }

    // ── 8. Views ────────────────────────────────────────────────────────────
    if (options.includeViews && options.mode !== 'data-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('views', 'Exporting views...', 0, 0)

      // Regular views
      const viewsResult = await client.query(`
        SELECT schemaname as schema, viewname as name, definition
        FROM pg_views
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, viewname
      `)

      const filteredViews = viewsResult.rows.filter((v) =>
        shouldIncludeSchema(v.schema, options.schemas)
      )

      if (filteredViews.length > 0) {
        emit(`--\n-- Views\n--\n\n`)
        for (const view of filteredViews) {
          if (options.includeDropStatements) {
            emit(`DROP VIEW IF EXISTS ${qualifiedName(view.schema, view.name)} CASCADE;\n`)
          }
          emit(
            `CREATE OR REPLACE VIEW ${qualifiedName(view.schema, view.name)} AS\n${view.definition}\n\n`
          )
        }
      }

      // Materialized views
      const matViewsResult = await client.query(`
        SELECT schemaname as schema, matviewname as name, definition
        FROM pg_matviews
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, matviewname
      `)

      const filteredMatViews = matViewsResult.rows.filter((v) =>
        shouldIncludeSchema(v.schema, options.schemas)
      )

      if (filteredMatViews.length > 0) {
        emit(`--\n-- Materialized views\n--\n\n`)
        for (const mv of filteredMatViews) {
          if (options.includeDropStatements) {
            emit(`DROP MATERIALIZED VIEW IF EXISTS ${qualifiedName(mv.schema, mv.name)} CASCADE;\n`)
          }
          emit(
            `CREATE MATERIALIZED VIEW ${qualifiedName(mv.schema, mv.name)} AS\n${mv.definition}\n\n`
          )
        }
      }
    }

    // ── 9. Functions / Procedures ───────────────────────────────────────────
    if (options.includeFunctions && options.mode !== 'data-only') {
      if (cancelToken.cancelled) throw new Error('Export cancelled')

      sendProgress('functions', 'Exporting functions...', 0, 0)

      const funcsResult = await client.query(`
        SELECT n.nspname as schema, p.proname as name,
               pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND p.prokind IN ('f', 'p')
        ORDER BY n.nspname, p.proname
      `)

      const filteredFuncs = funcsResult.rows.filter((f) =>
        shouldIncludeSchema(f.schema, options.schemas)
      )

      if (filteredFuncs.length > 0) {
        emit(`--\n-- Functions and procedures\n--\n\n`)
        for (const func of filteredFuncs) {
          if (func.definition) {
            emit(`${func.definition};\n\n`)
          }
        }
      }
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    if (options.includeTransaction) {
      emit(`COMMIT;\n`)
    }

    emit(`\n-- Export complete\n`)

    // Finalize file
    sendProgress('complete', 'Writing file...', 0, 0)

    await new Promise<void>((resolve, reject) => {
      writable.end(() => resolve())
      writable.on('error', reject)
    })

    const result: PgExportResult = {
      success: true,
      filePath,
      tablesExported,
      rowsExported,
      bytesWritten,
      durationMs: Date.now() - startTime
    }

    sendProgress('complete', '', 0, 0)
    log.info(
      `Export complete: ${tablesExported} tables, ${rowsExported} rows, ${bytesWritten} bytes in ${result.durationMs}ms`
    )

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Export failed:', error)

    onProgress({
      phase: 'error',
      currentObject: '',
      objectsProcessed: 0,
      totalObjects: 0,
      rowsExported,
      bytesWritten,
      error: message
    })

    return {
      success: false,
      filePath,
      tablesExported,
      rowsExported,
      bytesWritten,
      durationMs: Date.now() - startTime,
      error: message
    }
  } finally {
    writable.destroy()
    await client.end().catch(() => {})
    closeTunnel(tunnelSession)
  }
}
