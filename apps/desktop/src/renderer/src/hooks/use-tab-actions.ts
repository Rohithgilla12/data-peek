import { useCallback } from 'react'
import { useTabStore, useSplitStore } from '@/stores'

/**
 * Hook that provides tab actions integrated with the split pane system.
 * When tabs are created, they are automatically added to the focused pane.
 * When tabs are closed, they are removed from their pane.
 */
export function useTabActions() {
  const tabStore = useTabStore()
  const addTabToPane = useSplitStore((s) => s.addTabToPane)
  const removeTabFromPane = useSplitStore((s) => s.removeTabFromPane)

  const createQueryTab = useCallback(
    (connectionId: string | null, initialQuery?: string) => {
      const tabId = tabStore.createQueryTab(connectionId, initialQuery)
      addTabToPane(tabId)
      return tabId
    },
    [tabStore, addTabToPane]
  )

  const createTablePreviewTab = useCallback(
    (connectionId: string, schemaName: string, tableName: string) => {
      const tabId = tabStore.createTablePreviewTab(connectionId, schemaName, tableName)
      addTabToPane(tabId)
      return tabId
    },
    [tabStore, addTabToPane]
  )

  const createForeignKeyTab = useCallback(
    (connectionId: string, schema: string, table: string, column: string, value: unknown) => {
      const tabId = tabStore.createForeignKeyTab(connectionId, schema, table, column, value)
      addTabToPane(tabId)
      return tabId
    },
    [tabStore, addTabToPane]
  )

  const createERDTab = useCallback(
    (connectionId: string) => {
      const tabId = tabStore.createERDTab(connectionId)
      addTabToPane(tabId)
      return tabId
    },
    [tabStore, addTabToPane]
  )

  const createTableDesignerTab = useCallback(
    (connectionId: string, schemaName: string, tableName?: string) => {
      const tabId = tabStore.createTableDesignerTab(connectionId, schemaName, tableName)
      addTabToPane(tabId)
      return tabId
    },
    [tabStore, addTabToPane]
  )

  const closeTab = useCallback(
    (tabId: string) => {
      removeTabFromPane(tabId)
      tabStore.closeTab(tabId)
    },
    [tabStore, removeTabFromPane]
  )

  const closeAllTabs = useCallback(() => {
    // Get all tabs that will be closed (non-pinned)
    const tabsToClose = tabStore.tabs.filter((t) => !t.isPinned)
    tabsToClose.forEach((t) => removeTabFromPane(t.id))
    tabStore.closeAllTabs()
  }, [tabStore, removeTabFromPane])

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      const tabsToClose = tabStore.tabs.filter((t) => t.id !== tabId && !t.isPinned)
      tabsToClose.forEach((t) => removeTabFromPane(t.id))
      tabStore.closeOtherTabs(tabId)
    },
    [tabStore, removeTabFromPane]
  )

  const closeTabsToRight = useCallback(
    (tabId: string) => {
      const tabIndex = tabStore.tabs.findIndex((t) => t.id === tabId)
      const tabsToClose = tabStore.tabs.slice(tabIndex + 1).filter((t) => !t.isPinned)
      tabsToClose.forEach((t) => removeTabFromPane(t.id))
      tabStore.closeTabsToRight(tabId)
    },
    [tabStore, removeTabFromPane]
  )

  return {
    createQueryTab,
    createTablePreviewTab,
    createForeignKeyTab,
    createERDTab,
    createTableDesignerTab,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight
  }
}
