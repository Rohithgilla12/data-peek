import {
  DB_CAPABILITIES,
  NO_CAPABILITIES,
  type CapabilityRow,
  type DatabaseType
} from '@shared/index'

export function useCapabilities(dbType: DatabaseType | undefined): CapabilityRow {
  return dbType ? DB_CAPABILITIES[dbType] : NO_CAPABILITIES
}
