'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'
import { getDB } from '@/lib/dexie'

export function useUiState<T>(
  key: string,
  defaultValue: T
): { value: T; set: (v: T) => Promise<void> } {
  const { userId } = useAuth()

  const entry = useLiveQuery(async () => {
    if (!userId) return undefined
    const db = getDB(userId)
    return db.uiState.get(key)
  }, [userId, key])

  const set = useCallback(
    async (value: T) => {
      if (!userId) return
      const db = getDB(userId)
      await db.uiState.put({ key, value })
    },
    [userId, key]
  )

  return {
    value: (entry?.value as T) ?? defaultValue,
    set,
  }
}
