import {
  DB_CAPABILITIES,
  NO_CAPABILITIES,
  type CapabilityRow,
  type DatabaseType
} from '@shared/index'

/**
 * `const can = useCapabilities(connection?.dbType)` then `can.tableDesigner`.
 * Returns the frozen row for the dbType (stable identity, safe in deps arrays), or the
 * all-false row when nothing is connected.
 */
export function useCapabilities(dbType: DatabaseType | undefined): CapabilityRow {
  return dbType ? DB_CAPABILITIES[dbType] : NO_CAPABILITIES
}
