'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { getDB, type DexieSavedQuery } from '@/lib/dexie'

export function useSavedQueries(connectionId?: string, search?: string) {
  const { userId } = useAuth()

  const queries = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)
    let collection = db.savedQueries
      .where('_syncStatus')
      .notEqual('deleted')

    let results = await collection.reverse().sortBy('updatedAt')

    if (connectionId) {
      results = results.filter((q) => q.connectionId === connectionId)
    }

    if (search) {
      const term = search.toLowerCase()
      results = results.filter(
        (q) => q.name.toLowerCase().includes(term) || q.query.toLowerCase().includes(term)
      )
    }

    return results
  }, [userId, connectionId, search])

  const create = async (input: {
    connectionId: string
    name: string
    query: string
    description?: string
    category?: string
    tags?: string[]
  }) => {
    if (!userId) return
    const db = getDB(userId)
    const now = new Date().toISOString()
    await db.savedQueries.add({
      id: crypto.randomUUID(),
      ...input,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      _syncStatus: 'pending',
    })
  }

  const update = async (
    id: string,
    updates: Partial<Pick<DexieSavedQuery, 'name' | 'query' | 'description' | 'category' | 'tags'>>
  ) => {
    if (!userId) return
    const db = getDB(userId)
    await db.savedQueries.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  const remove = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.savedQueries.get(id)
    if (!item) return

    if (item._syncStatus === 'pending') {
      await db.savedQueries.delete(id)
    } else {
      await db.savedQueries.update(id, { _syncStatus: 'deleted' })
    }
  }

  const incrementUsage = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.savedQueries.get(id)
    if (!item) return
    await db.savedQueries.update(id, {
      usageCount: item.usageCount + 1,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  return { queries: queries ?? [], create, update, remove, incrementUsage }
}
