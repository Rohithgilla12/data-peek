'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { getDB } from '@/lib/dexie'

let activeTabId: string | null = null
const activeTabListeners = new Set<() => void>()

function setActiveTabId(id: string) {
  activeTabId = id
  activeTabListeners.forEach((l) => l())
}

function useActiveTabId() {
  return useSyncExternalStore(
    (cb) => {
      activeTabListeners.add(cb)
      return () => activeTabListeners.delete(cb)
    },
    () => activeTabId,
    () => activeTabId
  )
}

let tabCounter = 1

export function useQueryTabs() {
  const { userId } = useAuth()
  const currentActiveTabId = useActiveTabId()
  const initializedRef = useRef(false)

  const tabs = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)
    const all = await db.queryTabs.orderBy('updatedAt').toArray()

    if (all.length === 0 && !initializedRef.current) {
      initializedRef.current = true
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await db.queryTabs.add({ id, title: `Query ${tabCounter++}`, sql: '', updatedAt: now })
      setActiveTabId(id)
      return db.queryTabs.orderBy('updatedAt').toArray()
    }

    if (!currentActiveTabId && all.length > 0) {
      setActiveTabId(all[all.length - 1].id)
    }

    return all
  }, [userId, currentActiveTabId])

  const addTab = useCallback(async () => {
    if (!userId) return
    const db = getDB(userId)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.queryTabs.add({ id, title: `Query ${tabCounter++}`, sql: '', updatedAt: now })
    setActiveTabId(id)
  }, [userId])

  const removeTab = useCallback(
    async (id: string) => {
      if (!userId) return
      const db = getDB(userId)
      const all = await db.queryTabs.orderBy('updatedAt').toArray()
      if (all.length <= 1) return

      await db.queryTabs.delete(id)
      if (currentActiveTabId === id) {
        const remaining = all.filter((t) => t.id !== id)
        setActiveTabId(remaining[remaining.length - 1].id)
      }
    },
    [userId, currentActiveTabId]
  )

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const updateSql = useCallback(
    async (id: string, sql: string) => {
      if (!userId) return
      const db = getDB(userId)
      await db.queryTabs.update(id, { sql, updatedAt: new Date().toISOString() })
    },
    [userId]
  )

  return {
    tabs: tabs ?? [],
    activeTabId: currentActiveTabId ?? '',
    addTab,
    removeTab,
    setActiveTab,
    updateSql,
  }
}
