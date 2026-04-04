'use client'

import { useQueryState, parseAsStringLiteral } from 'nuqs'
import { SchemaExplorer } from '@/components/schema-explorer/schema-explorer'
import { SavedQueriesPanel } from '@/components/saved-queries/saved-queries-panel'
import { QueryHistoryPanel } from '@/components/history/query-history-panel'

const tabs = [
  { id: 'schema', label: 'Schema' },
  { id: 'saved', label: 'Saved' },
  { id: 'history', label: 'History' },
] as const

const sidebarTabs = ['schema', 'saved', 'history'] as const

export function SidebarContent() {
  const [activeTab, setActiveTab] = useQueryState(
    'sidebar',
    parseAsStringLiteral(sidebarTabs).withDefault('schema'),
  )
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${activeTab === tab.id ? 'text-accent border-b border-accent' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'schema' && <SchemaExplorer />}
        {activeTab === 'saved' && <SavedQueriesPanel />}
        {activeTab === 'history' && <QueryHistoryPanel />}
      </div>
    </div>
  )
}
