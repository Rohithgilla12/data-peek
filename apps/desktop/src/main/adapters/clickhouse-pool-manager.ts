import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { ConnectionConfig } from '@shared/index'
import { toClickHouseClientConfig } from './clickhouse-client-config'
import { PoolRegistry } from './pool-registry'

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

export async function closeClickHousePool(config: ConnectionConfig): Promise<void> {
  return registry.close(config)
}

export async function closeAllClickHousePools(): Promise<void> {
  return registry.closeAll()
}
