import {
  CapabilityError,
  hasCapability,
  type Capability,
  type DatabaseType,
  type DbTypesWith
} from '@shared/index'

export function requireCapability<T extends { dbType?: DatabaseType }, C extends Capability>(
  config: T,
  cap: C
): asserts config is T & { dbType: DbTypesWith<C> } {
  const dbType = config.dbType || 'postgresql'
  if (!hasCapability(dbType, cap)) throw new CapabilityError(dbType, cap)
}
