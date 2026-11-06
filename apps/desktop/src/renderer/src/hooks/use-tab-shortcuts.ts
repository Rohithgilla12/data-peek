import { useEffect, useMemo } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useHotkeys, type UseHotkeyDefinition, type Hotkey } from '@tanstack/react-hotkeys'
import { useConnectionStore, useTabStore } from '@/stores'

/**
 * Tab shortcuts (menu New/Close Tab, Mod+T new Ask tab, Mod+Shift+T new SQL tab, Mod+W,
 * tab cycling, Mod+1..9).
 *
 * Registered by the app shell rather than the tab container so they keep working on routes
 * that don't render tabs. Opening or focusing a tab brings the workspace back into view via
 * the tab store's focusRequest; closing only acts while the tabs are actually on screen.
 */
export function useTabShortcuts() {
  const router = useRouter()

  const shortcuts = useMemo(() => {
    const tabs = () => useTabStore.getState()

    const activeConnectionId = () => useConnectionStore.getState().activeConnectionId
    const newTab = () => {
      tabs().createAskTab(activeConnectionId())
    }
    const newSqlTab = () => {
      tabs().createQueryTab(activeConnectionId())
    }

    const closeTab = () => {
      if (router.state.location.pathname !== '/') return
      const { activeTabId } = tabs()
      if (activeTabId) tabs().closeTab(activeTabId)
    }

    const cycle = (step: 1 | -1) => {
      const { tabs: list, activeTabId, setActiveTab } = tabs()
      if (list.length === 0) return
      const current = list.findIndex((t) => t.id === activeTabId)
      const next = (current + step + list.length) % list.length
      setActiveTab(list[next].id)
    }

    const hotkeys: UseHotkeyDefinition[] = [
      { hotkey: 'Mod+T', callback: newTab },
      { hotkey: 'Mod+Shift+T', callback: newSqlTab },
      { hotkey: 'Mod+W', callback: closeTab },
      { hotkey: 'Mod+Alt+ArrowRight', callback: () => cycle(1) },
      { hotkey: 'Mod+Alt+ArrowLeft', callback: () => cycle(-1) },
      ...Array.from({ length: 9 }, (_, i) => ({
        hotkey: `Mod+${i + 1}` as Hotkey,
        callback: () => {
          const tab = tabs().tabs[i]
          if (tab) tabs().setActiveTab(tab.id)
        }
      }))
    ]

    return { newTab, closeTab, hotkeys }
  }, [router])

  useEffect(() => window.api.menu.onNewTab(shortcuts.newTab), [shortcuts])
  useEffect(() => window.api.menu.onCloseTab(shortcuts.closeTab), [shortcuts])
  useHotkeys(shortcuts.hotkeys)
}
