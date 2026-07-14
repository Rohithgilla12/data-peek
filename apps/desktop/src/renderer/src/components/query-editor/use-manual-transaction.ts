import { useEffect, useRef, useState } from 'react'
import { notify } from '@/stores'
import type { ConnectionWithStatus } from '@/stores/connection-store'

/**
 * Manual transaction mode (auto-commit off) for a query tab. The tab id doubles
 * as the backend session id — one pinned pool client per tab.
 *
 * Owns the auto-commit toggle state, explicit commit/rollback, and the safety
 * nets: rollback on tab unmount and rollback when the tab's connection changes.
 */
export function useManualTransaction(
  tabId: string,
  tabConnection: ConnectionWithStatus | null | undefined
): {
  autoCommit: boolean
  setAutoCommit: (v: boolean) => void
  hasActiveTransaction: boolean
  setHasActiveTransaction: (v: boolean) => void
  handleCommit: () => Promise<void>
  handleRollback: () => Promise<void>
} {
  const [autoCommit, setAutoCommit] = useState(true)
  const [hasActiveTransaction, setHasActiveTransaction] = useState(false)

  // Roll back any open transaction when the tab unmounts. Refs keep the
  // cleanup unmount-only without re-running on state changes.
  const transactionCleanupRef = useRef({ hasActiveTransaction, tabConnection })
  useEffect(() => {
    transactionCleanupRef.current = { hasActiveTransaction, tabConnection }
  }, [hasActiveTransaction, tabConnection])
  useEffect(() => {
    return () => {
      const { hasActiveTransaction: active, tabConnection: conn } = transactionCleanupRef.current
      if (active && conn) {
        window.api.db.rollbackTransaction(conn, tabId).catch(() => {})
      }
    }
  }, [tabId])

  // If the tab's connection changes while a transaction is open, roll it back on
  // the previous connection — commit/rollback must never target the wrong database.
  const prevConnectionRef = useRef(tabConnection)
  useEffect(() => {
    const prev = prevConnectionRef.current
    prevConnectionRef.current = tabConnection
    if (prev && tabConnection && prev.id !== tabConnection.id) {
      if (transactionCleanupRef.current.hasActiveTransaction) {
        window.api.db.rollbackTransaction(prev, tabId).catch(() => {})
        setHasActiveTransaction(false)
        notify.info('Open transaction rolled back — connection changed')
      }
    }
  }, [tabConnection, tabId])

  const handleCommit = async (): Promise<void> => {
    if (!tabConnection) return
    const res = await window.api.db.commitTransaction(tabConnection, tabId)
    if (res.success) {
      setHasActiveTransaction(false)
      notify.success('Transaction committed')
    } else {
      // The adapter discards the client on COMMIT failure, so the session is gone.
      setHasActiveTransaction(false)
      notify.error('Commit failed', res.error || 'Transaction was not committed')
    }
  }

  const handleRollback = async (): Promise<void> => {
    if (!tabConnection) return
    const res = await window.api.db.rollbackTransaction(tabConnection, tabId)
    setHasActiveTransaction(false)
    if (res.success) {
      notify.success('Transaction rolled back')
    } else {
      notify.error('Rollback failed', res.error || 'Transaction may still be open')
    }
  }

  return {
    autoCommit,
    setAutoCommit,
    hasActiveTransaction,
    setHasActiveTransaction,
    handleCommit,
    handleRollback
  }
}
