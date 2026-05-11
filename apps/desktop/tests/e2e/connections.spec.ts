import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * Connection persistence + listing — exercised through window.api so we cover the
 * IPC contract directly. UI-driven flows live in their own spec.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test('window.api.connections.add persists a connection that connections.list returns', async ({
  window
}) => {
  const config = pg.config

  const addResult = await window.evaluate(async (cfg) => {
    return window.api.connections.add(cfg)
  }, config)

  expect(addResult.success).toBe(true)

  const listResult = await window.evaluate(async () => {
    return window.api.connections.list()
  })

  expect(listResult.success).toBe(true)
  const names = (listResult.data ?? []).map((c) => c.name)
  expect(names).toContain(config.name)
})

test('window.api.db.connect succeeds against the seeded Postgres container', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    return window.api.db.connect(cfg)
  }, pg.config)

  expect(result.success).toBe(true)
})

test('userData isolation extends to connections — a fresh test sees no prior connections', async ({
  window
}) => {
  // The previous test in this file added a connection but each Playwright test gets
  // its own electronApp + userDataDir. Verifies the isolation contract holds even when
  // earlier tests in the same file mutate state.
  const listResult = await window.evaluate(async () => {
    return window.api.connections.list()
  })

  expect(listResult.success).toBe(true)
  expect(listResult.data ?? []).toEqual([])
})

test('connections.update round-trips a name change', async ({ window }) => {
  const config = pg.config

  // Add first so there is something to update.
  const addResult = await window.evaluate(async (cfg) => {
    return window.api.connections.add(cfg)
  }, config)
  expect(addResult.success).toBe(true)

  // connections.update takes the full ConnectionConfig with id embedded.
  const renamed = { ...config, name: config.name + '-renamed' }
  const updateResult = await window.evaluate(async (cfg) => {
    return window.api.connections.update(cfg)
  }, renamed)

  expect(updateResult.success).toBe(true)

  // Verify the rename is persisted.
  const listResult = await window.evaluate(async () => {
    return window.api.connections.list()
  })
  expect(listResult.success).toBe(true)
  const names = (listResult.data ?? []).map((c) => c.name)
  expect(names).toContain(config.name + '-renamed')
})

test('connections.delete removes the connection from the list', async ({ window }) => {
  const config = pg.config

  // Add a connection to delete.
  const addResult = await window.evaluate(async (cfg) => {
    return window.api.connections.add(cfg)
  }, config)
  expect(addResult.success).toBe(true)

  const deleteResult = await window.evaluate(async (id) => {
    return window.api.connections.delete(id)
  }, config.id)

  expect(deleteResult.success).toBe(true)

  // Verify the connection is gone.
  const listResult = await window.evaluate(async () => {
    return window.api.connections.list()
  })
  expect(listResult.success).toBe(true)
  const ids = (listResult.data ?? []).map((c) => c.id)
  expect(ids).not.toContain(config.id)
})
