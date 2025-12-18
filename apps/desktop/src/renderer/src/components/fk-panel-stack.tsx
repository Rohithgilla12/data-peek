import * as React from 'react'
import { X, Link2, ChevronRight, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ForeignKeyInfo, ConnectionConfig, ColumnInfo } from '@data-peek/shared'

// Panel item in the stack
export interface FKPanelItem {
  id: string
  foreignKey: ForeignKeyInfo
  value: unknown
  data?: Record<string, unknown>
  columns?: ColumnInfo[]
  isLoading: boolean
  error?: string
}

interface FKPanelStackProps {
  panels: FKPanelItem[]
  connection: ConnectionConfig | null
  onClose: (panelId: string) => void
  onCloseAll: () => void
  onDrillDown: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onOpenInTab: (foreignKey: ForeignKeyInfo, value: unknown) => void
}

// Single panel component
function FKPanel({
  panel,
  index,
  total,
  breadcrumbs,
  onClose,
  onDrillDown,
  onOpenInTab
}: {
  panel: FKPanelItem
  index: number
  total: number
  breadcrumbs: string[]
  onClose: () => void
  onDrillDown: (foreignKey: ForeignKeyInfo, value: unknown) => void
  onOpenInTab: (foreignKey: ForeignKeyInfo, value: unknown) => void
}) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null)

  const handleCopy = (key: string, value: unknown) => {
    navigator.clipboard.writeText(String(value ?? ''))
    setCopiedField(key)
    setTimeout(() => setCopiedField(null), 1500)
  }

  // Calculate width based on total panels - narrower when more panels
  const panelWidth = total === 1 ? 420 : total === 2 ? 360 : 320
  // Position panels side by side from right edge
  const rightOffset = (total - 1 - index) * panelWidth

  return (
    <div
      className="fixed inset-y-0 bg-background border-l border-border shadow-xl flex flex-col transition-all duration-200 z-50"
      style={{
        width: `${panelWidth}px`,
        right: `${rightOffset}px`
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-blue-400" />
          <span className="font-medium">{panel.foreignKey.referencedTable}</span>
          <Badge variant="outline" className="text-[10px]">
            {panel.foreignKey.referencedSchema}
          </Badge>
        </div>
      </div>

      {/* Breadcrumb trail */}
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground border-b border-border/50 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="size-3 shrink-0" />}
              <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {panel.isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : panel.error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
            <AlertCircle className="size-8 text-red-400" />
            <p className="text-sm text-muted-foreground">{panel.error}</p>
          </div>
        ) : panel.data ? (
          <div className="space-y-3">
            {Object.entries(panel.data).map(([key, value]) => {
              // Find if this field has a FK
              const columnInfo = panel.columns?.find((c) => c.name === key)
              const hasFK = columnInfo?.foreignKey && value !== null && value !== undefined

              return (
                <div key={key} className="group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs text-muted-foreground">{key}</span>
                        {hasFK && <Link2 className="size-3 text-blue-400" />}
                        {columnInfo?.isPrimaryKey && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            PK
                          </Badge>
                        )}
                      </div>
                      {value === null || value === undefined ? (
                        <span className="text-sm text-muted-foreground/50 italic">NULL</span>
                      ) : hasFK ? (
                        <button
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey) {
                              onOpenInTab(columnInfo!.foreignKey!, value)
                            } else {
                              onDrillDown(columnInfo!.foreignKey!, value)
                            }
                          }}
                          className="text-sm text-blue-400 hover:text-blue-300 hover:underline cursor-pointer font-mono text-left break-all"
                        >
                          {String(value)}
                        </button>
                      ) : typeof value === 'object' ? (
                        <pre className="text-sm font-mono bg-muted/30 rounded p-2 overflow-x-auto text-xs">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-sm font-mono break-all">{String(value)}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => handleCopy(key, value)}
                    >
                      {copiedField === key ? (
                        <Check className="size-3 text-green-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No data found
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {panel.foreignKey.referencedColumn} = {String(panel.value)}
        </span>
        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onClose}>
          <X className="size-3" />
          Close
        </Button>
      </div>
    </div>
  )
}

export function FKPanelStack({
  panels,
  onClose,
  onCloseAll,
  onDrillDown,
  onOpenInTab
}: FKPanelStackProps) {
  if (panels.length === 0) return null

  // Build breadcrumbs from panel stack
  const getBreadcrumbs = (upToIndex: number): string[] => {
    return panels.slice(0, upToIndex + 1).map((p) => p.foreignKey.referencedTable)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onCloseAll} />

      {/* All Panels stacked */}
      {panels.map((panel, index) => (
        <FKPanel
          key={panel.id}
          panel={panel}
          index={index}
          total={panels.length}
          breadcrumbs={getBreadcrumbs(index)}
          onClose={() => onClose(panel.id)}
          onDrillDown={onDrillDown}
          onOpenInTab={onOpenInTab}
        />
      ))}
    </>
  )
}
