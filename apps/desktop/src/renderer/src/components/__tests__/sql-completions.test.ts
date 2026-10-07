import { describe, it, expect } from 'vitest'
import { SQL_FUNCTIONS } from '@/constants/sql-functions'
import { SQL_TYPES } from '@/constants/sql-types'

const functionNames = SQL_FUNCTIONS.map((fn) => fn.name)

describe('SQL Functions', () => {
  // ClickHouse function names are case-sensitive, so the exact casing matters
  it.each(['uniqExact', 'quantile', 'toStartOfDay', 'toStartOfInterval', 'arrayJoin', 'multiIf'])(
    'should include the ClickHouse function %s',
    (name) => {
      expect(functionNames).toContain(name)
    }
  )

  it('should not have duplicate functions', () => {
    expect(new Set(functionNames).size).toBe(functionNames.length)
  })
})

describe('SQL Types', () => {
  it.each(['UInt8', 'UInt256', 'Int128', 'Float64', 'DateTime64', 'LowCardinality', 'Nullable'])(
    'should include the ClickHouse type %s',
    (type) => {
      expect(SQL_TYPES).toContain(type)
    }
  )

  it('should not have duplicate types', () => {
    expect(new Set(SQL_TYPES).size).toBe(SQL_TYPES.length)
  })
})
