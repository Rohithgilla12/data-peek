import {
  CapabilityError,
  hasCapability,
  type Capability,
  type ConnectionConfig,
  type DatabaseType,
  type DbTypesWith
} from '@shared/index'

/**
 * The first line of every gated IPC handler. Narrows `config.dbType` to the dbTypes
 * whose capability cell is true, which is the key type the dialect builders accept, so
 * a handler that forgets the guard fails to type-check against the builder.
 */
export function requireCapability<C extends Capability>(
  config: ConnectionConfig,
  cap: C
): asserts config is ConnectionConfig & { dbType: DbTypesWith<C> } {
  const dbType = config.dbType || 'postgresql'
  if (!hasCapability(dbType, cap)) throw new CapabilityError(dbType, cap)
}

/** For adapter bodies: `throw unsupported('clickhouse', 'transactions')`. Same message. */
export function unsupported(dbType: DatabaseType, cap: Capability): CapabilityError {
  return new CapabilityError(dbType, cap)
}
