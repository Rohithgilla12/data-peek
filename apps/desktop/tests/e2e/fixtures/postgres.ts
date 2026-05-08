import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Boots a Postgres container, loads the acme_saas seed, and returns the connection
 * details + a teardown handle. Designed for `test.beforeAll` / `test.afterAll` so a
 * spec file shares one container across its tests — per-test containers are too slow
 * (each takes 3-5s to spin up).
 *
 * Container lifetime is bounded by the Ryuk reaper, so even if a test crashes mid-run
 * the container is reaped within seconds.
 */
const SEED_PATH = resolve(__dirname, '..', '..', '..', '..', '..', 'seeds', 'acme_saas_seed.sql')

export interface SeededPostgres {
  container: StartedPostgreSqlContainer
  config: {
    /** Stable id we control so tests can reference the saved connection. */
    id: string
    name: string
    dbType: 'postgresql'
    host: string
    port: number
    database: string
    user: string
    password: string
    ssl: false
    dstPort: number
  }
  /** Stop the container. Safe to call multiple times. */
  stop: () => Promise<void>
}

export async function startSeededPostgres(): Promise<SeededPostgres> {
  const seedSql = readFileSync(SEED_PATH, 'utf-8')

  // pin the image so a Postgres minor bump doesn't silently change behaviour.
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('acme_saas')
    .withUsername('e2e')
    .withPassword('e2e')
    // Surface the seed under /docker-entrypoint-initdb.d/ so it runs on first boot —
    // faster + more atomic than streaming it through `psql` after the container is up.
    .withCopyContentToContainer([
      { content: seedSql, target: '/docker-entrypoint-initdb.d/00-acme.sql' }
    ])
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(5432)

  const config: SeededPostgres['config'] = {
    id: 'e2e-acme-saas',
    name: 'E2E acme_saas',
    dbType: 'postgresql',
    host,
    port,
    database: 'acme_saas',
    user: 'e2e',
    password: 'e2e',
    ssl: false,
    dstPort: port
  }

  return {
    container,
    config,
    stop: async () => {
      try {
        await container.stop()
      } catch {
        // Ryuk will reap it anyway.
      }
    }
  }
}
