import { faker } from '@faker-js/faker/locale/en'
import type { ColumnGenerator, DataGenConfig, GeneratorType, ConnectionConfig } from '@shared/index'
import type { DatabaseAdapter } from './db-adapter'
import { buildTableRef, quoteId, type BulkInsertDbType } from './batch-insert'

function callFakerMethod(method: string): unknown {
  const parts = method.split('.')
  if (parts.length !== 2) return faker.lorem.word()

  const [ns, fn] = parts
  if (ns === '__proto__' || ns === 'constructor' || ns === 'prototype') return faker.lorem.word()
  if (fn === '__proto__' || fn === 'constructor' || fn === 'prototype') return faker.lorem.word()
  const fakerAny = faker as unknown as Record<string, unknown>
  const namespace = fakerAny[ns]
  if (!namespace || typeof namespace !== 'object') return faker.lorem.word()

  const func = (namespace as Record<string, unknown>)[fn]
  if (typeof func !== 'function') return faker.lorem.word()

  const result = (func as () => unknown).call(namespace)
  if (result instanceof Date) return result.toISOString()
  return result
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
// Where a seeded run's default date window ends, so that the same seed gives
// the same dates whatever day it runs on.
const SEEDED_REFERENCE_MS = Date.UTC(2025, 0, 1)

function dateWindow(col: ColumnGenerator, seeded: boolean): { from: Date; to: Date } {
  const { minValue, maxValue } = col
  if (!seeded) {
    return {
      from: new Date(minValue ?? Date.now() - YEAR_MS),
      to: new Date(maxValue ?? Date.now())
    }
  }
  // A seeded run never reads the clock: a missing bound is a year from the
  // other one, and with neither the window ends at the fixed reference.
  const to = maxValue ?? (minValue != null ? minValue + YEAR_MS : SEEDED_REFERENCE_MS)
  return { from: new Date(minValue ?? to - YEAR_MS), to: new Date(to) }
}

function generateValue(
  col: ColumnGenerator,
  fkData: Map<string, unknown[]>,
  counters: Map<string, number>,
  seeded: boolean
): unknown {
  if (col.skip) return undefined

  if (col.nullPercentage > 0 && col.generatorType !== 'null') {
    if (faker.number.float({ min: 0, max: 100 }) < col.nullPercentage) return null
  }

  const type: GeneratorType = col.generatorType

  switch (type) {
    case 'auto-increment': {
      const key = col.columnName
      const current = counters.get(key) ?? 0
      counters.set(key, current + 1)
      return current + 1
    }

    case 'uuid':
      return faker.string.uuid()

    case 'faker':
      return callFakerMethod(col.fakerMethod ?? 'lorem.word')

    case 'random-int':
      return faker.number.int({ min: col.minValue ?? 0, max: col.maxValue ?? 1000 })

    case 'random-float':
      return faker.number.float({ min: col.minValue ?? 0, max: col.maxValue ?? 1000 })

    case 'random-boolean':
      return faker.datatype.boolean()

    case 'random-date':
      return faker.date.between(dateWindow(col, seeded)).toISOString()

    case 'random-enum': {
      const values = col.enumValues ?? []
      if (values.length === 0) return null
      return faker.helpers.arrayElement(values)
    }

    case 'fk-reference': {
      const fkKey = `${col.fkTable}.${col.fkColumn}`
      const ids = fkData.get(fkKey) ?? []
      if (ids.length === 0) return null
      return faker.helpers.arrayElement(ids)
    }

    case 'fixed':
      return col.fixedValue ?? null

    case 'null':
      return null

    case 'expression':
      return col.fixedValue ?? null

    default:
      return null
  }
}

export function generateRows(config: DataGenConfig, fkData: Map<string, unknown[]>): unknown[][] {
  const seeded = config.seed != null
  // Read the column list before touching faker, so a malformed config throws
  // while the module-level reference date is still the clock.
  const activeColumns = config.columns.filter((c) => !c.skip)
  if (config.seed != null) {
    faker.seed(config.seed)
    // faker's own date methods (date.recent, date.past, ...) default their
    // reference to "now", so a seeded run would still move with the clock.
    // The renderer heuristic maps created_at / updated_at / deleted_at to
    // exactly those, so this is the common case, not a corner one.
    faker.setDefaultRefDate(SEEDED_REFERENCE_MS)
  }

  const counters = new Map<string, number>()
  const rows: unknown[][] = []

  try {
    for (let i = 0; i < config.rowCount; i++) {
      const row = activeColumns.map((col) => generateValue(col, fkData, counters, seeded))
      rows.push(row)
    }
  } finally {
    // Back to the clock, so an unseeded run after a seeded one is relative
    // to now again.
    if (seeded) faker.setDefaultRefDate()
  }

  return rows
}

export async function resolveFK(
  adapter: DatabaseAdapter,
  connectionConfig: ConnectionConfig & { dbType: BulkInsertDbType },
  schema: string,
  fkTable: string,
  fkColumn: string
): Promise<unknown[]> {
  const dbType = connectionConfig.dbType
  const tableRef = buildTableRef(schema, fkTable, dbType)
  const sql =
    dbType === 'mssql'
      ? `SELECT TOP 1000 ${quoteId(fkColumn, dbType)} FROM ${tableRef}`
      : `SELECT ${quoteId(fkColumn, dbType)} FROM ${tableRef} LIMIT 1000`

  try {
    const result = await adapter.query(connectionConfig, sql)
    return result.rows.map((row) => {
      const r = row as Record<string, unknown>
      return r[fkColumn]
    })
  } catch (error) {
    // Surface the failure with context rather than returning [] — an empty result
    // here would silently generate rows with null FK values, corrupting the output.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to resolve FK values from ${tableRef}.${fkColumn}: ${message}`)
  }
}
