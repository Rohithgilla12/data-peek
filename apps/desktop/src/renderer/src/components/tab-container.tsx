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
                className={`size-1.5 rounded-full ${tabConnection.isConnected ? 'bg-success' : 'bg-warning'}`}
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
  const activeTab = useTabStore((s) => s.getActiveTab())

  const schemas = useConnectionStore((s) => s.schemas)
  const connections = useConnectionStore((s) => s.connections)
  const tabConnection = activeTab?.connectionId
    ? connections.find((c) => c.id === activeTab.connectionId)
    : null

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
