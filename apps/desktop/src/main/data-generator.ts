import { faker } from '@faker-js/faker/locale/en'
import type { ColumnGenerator, DataGenConfig, GeneratorType, ConnectionConfig } from '@shared/index'
import type { DatabaseAdapter } from './db-adapter'
import { quoteIdentifier } from './sql-utils'

const IDENTIFIER_QUOTES: Record<string, string> = {
  postgresql: '"',
  mysql: '`',
  sqlite: '"',
  mssql: '['
}

function quoteId(name: string, dbType: string): string {
  return quoteIdentifier(name, IDENTIFIER_QUOTES[dbType] ?? '"')
}

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

function generateValue(
  col: ColumnGenerator,
  fkData: Map<string, unknown[]>,
  counters: Map<string, number>
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

    case 'random-date': {
      const from = new Date(col.minValue ?? Date.now() - 365 * 24 * 60 * 60 * 1000)
      const to = new Date(col.maxValue ?? Date.now())
      return faker.date.between({ from, to }).toISOString()
    }

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
  if (config.seed != null) {
    faker.seed(config.seed)
  }

  const activeColumns = config.columns.filter((c) => !c.skip)
  const counters = new Map<string, number>()
  const rows: unknown[][] = []

  for (let i = 0; i < config.rowCount; i++) {
    const row = activeColumns.map((col) => generateValue(col, fkData, counters))
    rows.push(row)
  }

  return rows
}

export async function resolveFK(
  adapter: DatabaseAdapter,
  connectionConfig: ConnectionConfig,
  schema: string,
  fkTable: string,
  fkColumn: string
): Promise<unknown[]> {
  const dbType = connectionConfig.dbType
  const quotedTable = quoteId(fkTable, dbType)
  const tableRef =
    schema && schema !== 'public' && schema !== 'main' && schema !== 'dbo'
      ? `${quoteId(schema, dbType)}.${quotedTable}`
      : quotedTable
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
