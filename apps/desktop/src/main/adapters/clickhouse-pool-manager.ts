import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { ConnectionConfig } from '@shared/index'
import { toClickHouseClientConfig } from './clickhouse-client-config'
import { PoolRegistry } from './pool-registry'

/**
 * One HTTP client per saved connection. The client already multiplexes keep-alive
 * sockets; the registry adds the SSH tunnel, the shape fingerprint, and teardown.
 */
const registry = new PoolRegistry<ClickHouseClient>({
  driver: 'clickhouse',
  create: (config, overrides) => createClient(toClickHouseClientConfig(config, overrides)),
  destroy: (client) => client.close()
})

export async function withClickHouseClient<T>(
  config: ConnectionConfig,
  fn: (client: ClickHouseClient) => Promise<T>
): Promise<T> {
  const entry = await registry.getOrCreate(config)
  return fn(entry.pool)
}

/** Close the client (and tunnel) for a single connection. */
export async function closeClickHousePool(config: ConnectionConfig): Promise<void> {
  return registry.close(config)
}

/** Close every ClickHouse client. Call on app shutdown. */
export async function closeAllClickHousePools(): Promise<void> {
  return registry.closeAll()
}
