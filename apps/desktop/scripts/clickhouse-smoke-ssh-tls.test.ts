import { describe, it, expect, afterAll, vi } from 'vitest'
import { resolve } from 'path'
import { type ConnectionConfig } from '@shared/index'

vi.mock('../src/main/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { withClickHouseClient, closeAllClickHousePools } =
  await import('../src/main/adapters/clickhouse-pool-manager')

const tlsDir = resolve(__dirname, '../../../seeds/clickhouse/tls')
const sshDir = resolve(__dirname, '../../../seeds/clickhouse/ssh')
const httpsPort = Number(process.env.CH_HTTPS_PORT ?? 58443)
const sshPort = Number(process.env.CH_SSH_PORT ?? 52222)

const base = {
  name: 'smoke-ssh-tls',
  database: process.env.CH_DATABASE ?? 'acme_analytics',
  user: process.env.CH_USER ?? 'datapeek',
  password: process.env.CH_PASSWORD ?? 'smoketest',
  dbType: 'clickhouse'
} as const

const sshConfig = {
  host: process.env.CH_SSH_HOST ?? 'localhost',
  port: sshPort,
  user: 'tunnel',
  authMethod: 'Public Key',
  privateKeyPath: resolve(sshDir, 'id_rsa')
} as const

const httpsConfig: ConnectionConfig = {
  ...base,
  id: 'smoke-ch-https',
  host: process.env.CH_HOST ?? 'localhost',
  port: httpsPort,
  ssl: true,
  sslOptions: { ca: resolve(tlsDir, 'ca.crt') },
  dstPort: httpsPort
}

const sshTunnelConfig: ConnectionConfig = {
  ...base,
  id: 'smoke-ch-ssh',
  // Resolved from the bastion over the compose network, never by the client.
  host: 'clickhouse-tls',
  port: 8123,
  ssl: false,
  ssh: true,
  sshConfig,
  dstPort: 8123
}

const sshTlsConfig: ConnectionConfig = {
  ...base,
  id: 'smoke-ch-ssh-tls',
  host: 'clickhouse-tls',
  port: 8443,
  ssl: true,
  sslOptions: { ca: resolve(tlsDir, 'ca.crt') },
  ssh: true,
  sshConfig,
  dstPort: 8443
}

async function oddNamesCount(config: ConnectionConfig): Promise<number> {
  return withClickHouseClient(config, async (client) => {
    const rs = await client.query({
      query: 'SELECT count() AS c FROM acme_analytics.`odd-names`',
      format: 'JSON'
    })
    const { data } = await rs.json<{ c: string }>()
    return Number(data[0].c)
  })
}

afterAll(async () => {
  await closeAllClickHousePools()
})

describe('clickhouse https', () => {
  it('connects over HTTPS with the test CA', async () => {
    await expect(oddNamesCount(httpsConfig)).resolves.toBe(3)
  })

  it('refuses the same endpoint when the CA is not supplied', async () => {
    const strict: ConnectionConfig = {
      ...httpsConfig,
      id: 'smoke-ch-https-strict',
      sslOptions: { rejectUnauthorized: true }
    }
    await expect(oddNamesCount(strict)).rejects.toThrow(/self.signed|certificate/i)
  })
})

describe('clickhouse over ssh tunnel', () => {
  it('queries plain HTTP through the bastion', async () => {
    await expect(oddNamesCount(sshTunnelConfig)).resolves.toBe(3)
  })

  it('queries HTTPS through the bastion with strict verification', async () => {
    await expect(oddNamesCount(sshTlsConfig)).resolves.toBe(3)
  })
})
