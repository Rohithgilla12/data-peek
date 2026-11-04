import { useCallback, useEffect, useMemo } from 'react'
import { TabBar } from '@/components/tab-bar'
import { TabQueryEditor } from '@/components/tab-query-editor'
import { NotebookEditor } from '@/components/notebook-editor'
import { ERDVisualization } from '@/components/erd-visualization'
import { TableDesigner } from '@/components/table-designer'
import { DataGenerator } from '@/components/data-generator'
import { PgNotificationsPanel } from '@/components/pg-notifications-panel'
import { HealthMonitor } from '@/components/health-monitor'
import { SchemaIntelPanel } from '@/components/schema-intel'
import { AskView } from '@/components/ask/ask-view'
import { useTabStore, useConnectionStore } from '@/stores'
import { useHotkeys, type UseHotkeyDefinition, type Hotkey } from '@tanstack/react-hotkeys'
import type { NotebookTab, Tab } from '@/stores/tab-store'
import type { ConnectionWithStatus, Schema } from '@/stores/connection-store'

function renderTabContent(
  tab: Tab,
  schemas: Schema[],
  tabConnection?: ConnectionWithStatus | null
) {
  if (tab.type === 'ask') {
    return <AskView key={tab.id} tabId={tab.id} />
  }

  if (tab.type === 'notebook') {
    return <NotebookEditor key={tab.id} tab={tab as NotebookTab} />
  }

  if (tab.type === 'erd') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-2">
          <span className="text-sm font-medium">Entity Relationship Diagram</span>
          {tabConnection && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${tabConnection.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
              {tabConnection.name}
            </span>
          )}
        </div>
        <div className="flex-1">
          <ERDVisualization schemas={schemas} />
        </div>
      </div>
    )
  }

  if (tab.type === 'table-designer') {
    return <TableDesigner key={tab.id} tabId={tab.id} />
  }

  if (tab.type === 'data-generator') {
    return <DataGenerator key={tab.id} tabId={tab.id} />
  }

  if (tab.type === 'pg-notifications') {
    return <PgNotificationsPanel key={tab.id} tabId={tab.id} />
  }

  if (tab.type === 'health-monitor') {
    return <HealthMonitor key={tab.id} tabId={tab.id} />
  }

  if (tab.type === 'schema-intel') {
    return <SchemaIntelPanel key={tab.id} tabId={tab.id} />
  }

  return <TabQueryEditor key={tab.id} tabId={tab.id} />
}

export function TabContainer() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const createAskTab = useTabStore((s) => s.createAskTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const activeTab = useTabStore((s) => s.getActiveTab())

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const schemas = useConnectionStore((s) => s.schemas)
  const connections = useConnectionStore((s) => s.connections)
  const tabConnection = activeTab?.connectionId
    ? connections.find((c) => c.id === activeTab.connectionId)
    : null

  const handleNewTab = useCallback(() => {
    createAskTab(activeConnectionId)
  }, [createAskTab, activeConnectionId])

  const handleNewSqlTab = useCallback(() => {
    createQueryTab(activeConnectionId)
  }, [createQueryTab, activeConnectionId])

  const handleCloseTab = useCallback(() => {
    if (activeTabId) closeTab(activeTabId)
  }, [activeTabId, closeTab])

  useEffect(() => window.api.menu.onNewTab(handleNewTab), [handleNewTab])
  useEffect(() => window.api.menu.onCloseTab(handleCloseTab), [handleCloseTab])

  // Keyboard shortcuts
  const tabHotkeys = useMemo<UseHotkeyDefinition[]>(
    () => [
      { hotkey: 'Mod+T', callback: handleNewTab },
      { hotkey: 'Mod+Shift+T', callback: handleNewSqlTab },
      { hotkey: 'Mod+W', callback: handleCloseTab },
      {
        hotkey: 'Mod+Alt+ArrowRight',
        callback: () => {
          if (tabs.length <= 1 || !activeTabId) return
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1
          setActiveTab(tabs[nextIndex].id)
        }
      },
      {
        hotkey: 'Mod+Alt+ArrowLeft',
        callback: () => {
          if (tabs.length <= 1 || !activeTabId) return
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
          setActiveTab(tabs[nextIndex].id)
        }
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        hotkey: `Mod+${i + 1}` as Hotkey,
        callback: () => {
          if (tabs[i]) setActiveTab(tabs[i].id)
        }
      }))
    ],
    [tabs, activeTabId, handleNewTab, handleNewSqlTab, handleCloseTab, setActiveTab]
  )
  useHotkeys(tabHotkeys)

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar />
        <AskView tabId={null} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabBar />
      {activeTab && renderTabContent(activeTab, schemas, tabConnection)}
    </div>
  )
}
