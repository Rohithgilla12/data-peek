import { test, expect } from './fixtures/electron-app'

/**
 * Saved query integration tests — exercise the real Electron preload IPC bridge
 * and the main-process persisted storage. This pins the desktop contract used by
 * the saved-query dialog without relying on renderer store implementation details.
 */

type SavedQueryInput = {
  id: string
  name: string
  query: string
  description?: string
  connectionId?: string
  tags: string[]
  folder?: string
  isPinned?: boolean
  usageCount: number
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

function makeSavedQuery(overrides: Partial<SavedQueryInput> = {}): SavedQueryInput {
  const now = Date.now()

  return {
    id: `e2e-query-${now}`,
    name: 'E2E saved revenue query',
    query: 'SELECT organization_id, SUM(amount) FROM invoices GROUP BY organization_id',
    description: 'Revenue grouped by organization',
    connectionId: 'e2e-acme-saas',
    tags: ['e2e', 'revenue'],
    folder: 'Reports/Revenue',
    isPinned: true,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

test('savedQueries CRUD and usage metadata persist through window.api', async ({ window }) => {
  const saved = makeSavedQuery()

  const emptyList = await window.evaluate(() => window.api.savedQueries.list())
  expect(emptyList.success).toBe(true)
  expect(emptyList.data).toEqual([])

  const addResult = await window.evaluate((query) => window.api.savedQueries.add(query), saved)
  expect(addResult.success).toBe(true)
  expect(addResult.data).toMatchObject({
    id: saved.id,
    name: saved.name,
    query: saved.query,
    tags: saved.tags,
    folder: saved.folder,
    isPinned: true,
    usageCount: 0
  })

  const updateResult = await window.evaluate(
    ({ id }) =>
      window.api.savedQueries.update(id, {
        name: 'E2E saved revenue query v2',
        tags: ['e2e', 'revenue', 'updated'],
        isPinned: false
      }),
    { id: saved.id }
  )
  expect(updateResult.success).toBe(true)
  expect(updateResult.data?.name).toBe('E2E saved revenue query v2')
  expect(updateResult.data?.tags).toEqual(['e2e', 'revenue', 'updated'])
  expect(updateResult.data?.isPinned).toBe(false)
  expect(updateResult.data?.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt)

  const usageResult = await window.evaluate(
    (id) => window.api.savedQueries.incrementUsage(id),
    saved.id
  )
  expect(usageResult.success).toBe(true)
  expect(usageResult.data?.usageCount).toBe(1)
  expect(typeof usageResult.data?.lastUsedAt).toBe('number')

  const listAfterUsage = await window.evaluate(() => window.api.savedQueries.list())
  expect(listAfterUsage.success).toBe(true)
  expect(listAfterUsage.data).toHaveLength(1)
  expect(listAfterUsage.data?.[0]).toMatchObject({
    id: saved.id,
    name: 'E2E saved revenue query v2',
    usageCount: 1
  })

  const deleteResult = await window.evaluate((id) => window.api.savedQueries.delete(id), saved.id)
  expect(deleteResult.success).toBe(true)

  const listAfterDelete = await window.evaluate(() => window.api.savedQueries.list())
  expect(listAfterDelete.success).toBe(true)
  expect(listAfterDelete.data).toEqual([])
})

test('savedQueries update and increment return clean not-found errors', async ({ window }) => {
  const updateMissing = await window.evaluate(() =>
    window.api.savedQueries.update('missing-saved-query', { name: 'Nope' })
  )
  expect(updateMissing.success).toBe(false)
  expect(updateMissing.error).toContain('Saved query not found')

  const incrementMissing = await window.evaluate(() =>
    window.api.savedQueries.incrementUsage('missing-saved-query')
  )
  expect(incrementMissing.success).toBe(false)
  expect(incrementMissing.error).toContain('Saved query not found')
})
