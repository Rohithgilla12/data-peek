import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SEED_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'seeds',
  'clickhouse',
  'init',
  '01_acme_analytics.sql'
)

export interface SeededClickHouse {
  container: StartedTestContainer
  config: {
    id: string
    name: string
    dbType: 'clickhouse'
    host: string
    port: number
    database: string
    user: string
    password: string
    ssl: false
    dstPort: number
  }
  stop: () => Promise<void>
}

export async function startSeededClickHouse(): Promise<SeededClickHouse> {
  const container = await new GenericContainer('clickhouse/clickhouse-server:24.8')
    .withEnvironment({
      CLICKHOUSE_USER: 'e2e',
      CLICKHOUSE_PASSWORD: 'e2e',
      CLICKHOUSE_DB: 'acme_analytics',
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1'
    })
    .withUlimits({ nofile: { soft: 262144, hard: 262144 } })
    .withCopyContentToContainer([
      {
        content: readFileSync(SEED_PATH, 'utf-8'),
        target: '/docker-entrypoint-initdb.d/01_acme_analytics.sql'
      }
    ])
    .withExposedPorts(8123)
    // The init server listens only inside the container, so /ping on the mapped port
    // answers once the real server is up and the seed has finished.
    .withWaitStrategy(
      Wait.forAll([
        Wait.forSuccessfulCommand(
          'clickhouse-client --user e2e --password e2e -q "SELECT count() FROM acme_analytics.\\`odd-names\\`" | grep -q 3'
        ),
        Wait.forHttp('/ping', 8123).forStatusCode(200)
      ])
    )
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(8123)

  return {
    container,
    config: {
      id: 'e2e-acme-analytics',
      name: 'E2E acme_analytics',
      dbType: 'clickhouse',
      host,
      port,
      database: 'acme_analytics',
      user: 'e2e',
      password: 'e2e',
      ssl: false,
      dstPort: port
    },
    stop: async () => {
      try {
        await container.stop()
      } catch {
        // Ryuk reaps it anyway.
      }
    }
  }
}
