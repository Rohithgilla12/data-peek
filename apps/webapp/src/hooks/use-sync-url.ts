'use client'

import { useEffect } from 'react'
import { useQueryState } from 'nuqs'
import { parseAsString } from 'nuqs'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'

export function useSyncUrl() {
  const [connectionParam, setConnectionParam] = useQueryState('connection', parseAsString)
  const [sqlParam, setSqlParam] = useQueryState('sql', parseAsString)

  const { activeConnectionId, setActiveConnection } = useConnectionStore()
  const { tabs, activeTabId, updateSql } = useQueryStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // URL -> Store: on mount, restore from URL
  useEffect(() => {
    if (connectionParam && connectionParam !== activeConnectionId) {
      setActiveConnection(connectionParam)
    }
  }, [])

  // URL -> Store: restore SQL from URL on mount
  useEffect(() => {
    if (sqlParam && activeTab && !activeTab.sql) {
      updateSql(activeTabId, sqlParam)
    }
  }, [])

  // Store -> URL: sync connection changes to URL
  useEffect(() => {
    if (activeConnectionId !== connectionParam) {
      setConnectionParam(activeConnectionId)
    }
  }, [activeConnectionId])

  // Store -> URL: sync SQL changes to URL (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const sql = activeTab?.sql || null
      if (sql !== sqlParam) {
        setSqlParam(sql || null)
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [activeTab?.sql])
}
