/**
 * Resolve explicit primary-key columns for a single-table SELECT from the
 * schema cache. Shared by Watch Mode diffing and Time Machine capture so both
 * derive identical row keys for the same query. Returns undefined when the SQL
 * doesn't resolve to one unambiguous table — pickKeyingPlan's heuristic takes
 * over from there.
 */

import type { DatabaseType, SchemaInfo } from '@data-peek/shared'
import { analyzeEditableSelect } from './editable-select'

export function resolveSelectKeyColumns(
  sql: string,
  dbType: DatabaseType,
  schemas: ReadonlyArray<SchemaInfo>
): string[] | undefined {
  const info = analyzeEditableSelect(sql, dbType)
  if (!info || info.hasFilters) return undefined
  const candidates = schemas.filter(
    (s) => !info.schema || s.name.toLowerCase() === info.schema.toLowerCase()
  )
  for (const schema of candidates) {
    const tableInfo = schema.tables.find((t) => t.name.toLowerCase() === info.table.toLowerCase())
    if (tableInfo) {
      const pks = tableInfo.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
      if (pks.length > 0) return pks
      break
    }
  }
  return undefined
}
