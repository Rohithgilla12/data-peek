'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { getDB } from '@/lib/dexie'

export function useQueryHistory(connectionId?: string, status?: 'success' | 'error') {
  const { userId } = useAuth()

  const history = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)

    let results = await db.queryHistory
      .where('_syncStatus')
      .notEqual('deleted')
      .reverse()
      .sortBy('executedAt')

    if (connectionId) {
      results = results.filter((h) => h.connectionId === connectionId)
    }

    if (status) {
      results = results.filter((h) => h.status === status)
    }

    return results.slice(0, 200)
  }, [userId, connectionId, status])

  const addEntry = async (entry: {
    connectionId: string
    query: string
    status: 'success' | 'error'
    durationMs?: number
    rowCount?: number
    errorMessage?: string
  }) => {
    if (!userId) return
    const db = getDB(userId)
    await db.queryHistory.add({
      id: crypto.randomUUID(),
      ...entry,
      executedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  const remove = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.queryHistory.get(id)
    if (!item) return

    if (item._syncStatus === 'pending') {
      await db.queryHistory.delete(id)
    } else {
      await db.queryHistory.update(id, { _syncStatus: 'deleted' })
    }
  }

  const clearAll = async (connectionId?: string) => {
    if (!userId) return
    const db = getDB(userId)

    if (connectionId) {
      const entries = await db.queryHistory
        .where('connectionId')
        .equals(connectionId)
        .toArray()
      for (const entry of entries) {
        if (entry._syncStatus === 'pending') {
          await db.queryHistory.delete(entry.id)
        } else {
          await db.queryHistory.update(entry.id, { _syncStatus: 'deleted' })
        }
      }
    } else {
      const entries = await db.queryHistory.toArray()
      for (const entry of entries) {
        if (entry._syncStatus === 'pending') {
          await db.queryHistory.delete(entry.id)
        } else {
          await db.queryHistory.update(entry.id, { _syncStatus: 'deleted' })
        }
      }
    }
  }

  return { history: history ?? [], addEntry, remove, clearAll }
}
