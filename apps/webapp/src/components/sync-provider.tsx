'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { trpc, type TRPCClient } from '@/lib/trpc-client'
import { SyncManager } from '@/lib/sync-manager'

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const syncRef = useRef<SyncManager | null>(null)
  const trpcClient = trpc.useUtils().client as TRPCClient

  useEffect(() => {
    if (!userId || !trpcClient) return

    const manager = new SyncManager(userId, trpcClient)
    syncRef.current = manager
    manager.start()

    return () => {
      manager.stop()
      syncRef.current = null
    }
  }, [userId, trpcClient])

  return <>{children}</>
}
