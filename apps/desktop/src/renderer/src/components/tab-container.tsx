'use client'

import { useEffect, useCallback } from 'react'
import { useTabStore, useConnectionStore, useSplitStore } from '@/stores'
import { SplitPaneContainer } from '@/components/split-pane-container'

export function TabContainer() {
  const tabs = useTabStore((s) => s.tabs)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const closeTab = useTabStore((s) => s.closeTab)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const focusedPane = useSplitStore((s) => s.getFocusedPane())
  const addTabToPane = useSplitStore((s) => s.addTabToPane)
  const removeTabFromPane = useSplitStore((s) => s.removeTabFromPane)
  const setActivePaneTab = useSplitStore((s) => s.setActivePaneTab)
  const getAllPaneIds = useSplitStore((s) => s.getAllPaneIds)
  const splitPane = useSplitStore((s) => s.splitPane)
  const focusPane = useSplitStore((s) => s.focusPane)

  const handleNewTab = useCallback(() => {
    const tabId = createQueryTab(activeConnectionId)
    addTabToPane(tabId)
  }, [createQueryTab, activeConnectionId, addTabToPane])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      removeTabFromPane(tabId)
      closeTab(tabId)
    },
    [removeTabFromPane, closeTab]
  )

  // Menu event listeners
  useEffect(() => {
    const unsubSplitRight = window.api.menu.onSplitRight(() => {
      if (focusedPane) {
        splitPane(focusedPane.id, 'horizontal')
      }
    })
    const unsubSplitDown = window.api.menu.onSplitDown(() => {
      if (focusedPane) {
        splitPane(focusedPane.id, 'vertical')
      }
    })
    return () => {
      unsubSplitRight()
      unsubSplitDown()
    }
  }, [focusedPane, splitPane])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+T: New tab
      if (isMeta && e.key === 't') {
        e.preventDefault()
        handleNewTab()
        return
      }

      // Cmd+W: Close current tab
      if (isMeta && e.key === 'w' && focusedPane?.activeTabId) {
        e.preventDefault()
        handleCloseTab(focusedPane.activeTabId)
        return
      }

      // Cmd+1-9: Switch to tab N in focused pane
      if (isMeta && e.key >= '1' && e.key <= '9' && focusedPane) {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        const paneTabs = tabs.filter((t) => focusedPane.tabIds.includes(t.id))
        if (paneTabs[tabIndex]) {
          setActivePaneTab(focusedPane.id, paneTabs[tabIndex].id)
        }
        return
      }

      // Cmd+Option+ArrowRight: Next tab in focused pane
      // Cmd+Option+ArrowLeft: Previous tab in focused pane
      if (
        isMeta &&
        e.altKey &&
        (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
        focusedPane &&
        focusedPane.tabIds.length > 1 &&
        focusedPane.activeTabId
      ) {
        e.preventDefault()
        const paneTabs = tabs.filter((t) => focusedPane.tabIds.includes(t.id))
        const currentIndex = paneTabs.findIndex((t) => t.id === focusedPane.activeTabId)
        let nextIndex: number

        if (e.key === 'ArrowLeft') {
          nextIndex = currentIndex <= 0 ? paneTabs.length - 1 : currentIndex - 1
        } else {
          nextIndex = currentIndex >= paneTabs.length - 1 ? 0 : currentIndex + 1
        }

        setActivePaneTab(focusedPane.id, paneTabs[nextIndex].id)
        return
      }

      // Cmd+\: Split current pane right (horizontal)
      if (isMeta && !e.shiftKey && e.key === '\\' && focusedPane) {
        e.preventDefault()
        splitPane(focusedPane.id, 'horizontal')
        return
      }

      // Cmd+Shift+\: Split current pane down (vertical)
      if (isMeta && e.shiftKey && e.key === '\\' && focusedPane) {
        e.preventDefault()
        splitPane(focusedPane.id, 'vertical')
        return
      }

      // Cmd+Option+Shift+ArrowRight/ArrowLeft: Focus next/previous pane
      if (isMeta && e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        const allPaneIds = getAllPaneIds()
        if (allPaneIds.length > 1 && focusedPane) {
          const currentIdx = allPaneIds.indexOf(focusedPane.id)
          let nextIdx: number
          if (e.key === 'ArrowRight') {
            nextIdx = currentIdx >= allPaneIds.length - 1 ? 0 : currentIdx + 1
          } else {
            nextIdx = currentIdx <= 0 ? allPaneIds.length - 1 : currentIdx - 1
          }
          focusPane(allPaneIds[nextIdx])
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    tabs,
    focusedPane,
    handleNewTab,
    handleCloseTab,
    setActivePaneTab,
    getAllPaneIds,
    splitPane,
    focusPane
  ])

  return <SplitPaneContainer />
}
