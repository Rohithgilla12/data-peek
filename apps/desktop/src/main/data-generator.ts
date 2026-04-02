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

interface Heuristic {
  pattern: RegExp
  generator: Partial<ColumnGenerator>
}

const HEURISTICS: Heuristic[] = [
  { pattern: /^email$/i, generator: { generatorType: 'faker', fakerMethod: 'internet.email' } },
  {
    pattern: /^(first_?name|fname)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.firstName' }
  },
  {
    pattern: /^(last_?name|lname|surname)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.lastName' }
  },
  {
    pattern: /^(name|full_?name)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'person.fullName' }
  },
  {
    pattern: /^(phone|mobile|cell)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'phone.number' }
  },
  { pattern: /^(city)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.city' } },
  {
    pattern: /^(country)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'location.country' }
  },
  {
    pattern: /^(url|website)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'internet.url' }
  },
  {
    pattern: /^(bio|description|about)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'lorem.paragraph' }
  },
  {
    pattern: /^(title|subject)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'lorem.sentence' }
  },
  {
    pattern: /^(company|organization)$/i,
    generator: { generatorType: 'faker', fakerMethod: 'company.name' }
  },
  {
    pattern: /^(created|updated|deleted)_?(at|on|date)?$/i,
    generator: { generatorType: 'faker', fakerMethod: 'date.recent' }
  },
  { pattern: /^(uuid|guid)$/i, generator: { generatorType: 'uuid' } }
]

export function getHeuristicGenerator(
  columnName: string,
  dataType: string
): Partial<ColumnGenerator> {
  for (const h of HEURISTICS) {
    if (h.pattern.test(columnName)) {
      return h.generator
    }
  }

  const dt = dataType.toLowerCase()

  if (dt.includes('uuid')) return { generatorType: 'uuid' }
  if (dt === 'boolean' || dt === 'bool') return { generatorType: 'random-boolean' }
  if (
    dt.includes('int') ||
    dt === 'smallint' ||
    dt === 'bigint' ||
    dt === 'tinyint' ||
    dt === 'serial' ||
    dt === 'bigserial'
  ) {
    return { generatorType: 'random-int', minValue: 1, maxValue: 1000 }
  }
  if (
    dt.includes('float') ||
    dt.includes('double') ||
    dt.includes('decimal') ||
    dt.includes('numeric') ||
    dt.includes('real') ||
    dt.includes('money')
  ) {
    return { generatorType: 'random-float', minValue: 0, maxValue: 1000 }
  }
  if (
    dt.includes('timestamp') ||
    dt.includes('datetime') ||
    dt.includes('date') ||
    dt.includes('time')
  ) {
    return { generatorType: 'random-date' }
  }

  return { generatorType: 'faker', fakerMethod: 'lorem.word' }
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
    if (Math.random() * 100 < col.nullPercentage) return null
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
      return values[Math.floor(Math.random() * values.length)]
    }

    case 'fk-reference': {
      const fkKey = `${col.fkTable}.${col.fkColumn}`
      const ids = fkData.get(fkKey) ?? []
      if (ids.length === 0) return null
      return ids[Math.floor(Math.random() * ids.length)]
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
  } catch {
    return []
  }
}
