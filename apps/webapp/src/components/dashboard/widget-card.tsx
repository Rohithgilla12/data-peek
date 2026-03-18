import { useState } from 'react'
import {
  GripVertical,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Settings,
  Maximize2,
  Minimize2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useDashboardStore } from '@/stores'
import type { Widget, ChartWidgetConfig, KPIWidgetConfig, TableWidgetConfig } from '@shared/index'
import { WidgetChart } from './widget-chart'
import { WidgetKPI } from './widget-kpi'
import { WidgetTable } from './widget-table'
import { EditWidgetDialog } from './edit-widget-dialog'

interface WidgetCardProps {
  widget: Widget
  dashboardId: string
  editMode: boolean
}

/**
 * Renders a dashboard widget as a card with header actions (refresh, toggle width, configure, delete) and a content area that displays the widget's data or loading/error states.
 *
 * @param widget - The widget definition including its config, id, and layout.
 * @param dashboardId - The parent dashboard's identifier used for update and delete actions.
 * @param editMode - When true, shows edit affordances such as the drag handle and action controls.
 * @returns The card element that hosts the widget UI and actions.
 */
export function WidgetCard({ widget, dashboardId, editMode }: WidgetCardProps) {
  const widgetData = useDashboardStore((s) => s.getWidgetData(widget.id))
  const isLoading = useDashboardStore((s) => s.isWidgetLoading(widget.id))
  const refreshWidget = useDashboardStore((s) => s.refreshWidget)
  const deleteWidget = useDashboardStore((s) => s.deleteWidget)
  const updateWidget = useDashboardStore((s) => s.updateWidget)

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const isFullWidth = widget.layout.w === 12

  const handleRefresh = () => {
    refreshWidget(widget)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this widget?')) {
      await deleteWidget(dashboardId, widget.id)
    }
  }

  const handleToggleFullWidth = async () => {
    const newWidth = isFullWidth ? 4 : 12
    const newHeight = isFullWidth ? 3 : Math.max(widget.layout.h, 4)
    await updateWidget(dashboardId, widget.id, {
      layout: {
        ...widget.layout,
        w: newWidth,
        h: newHeight,
        x: 0
      }
    })
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {editMode && (
            <div className="widget-drag-handle cursor-move">
              <GripVertical className="size-4 text-muted-foreground" />
            </div>
          )}
          <CardTitle className="text-sm font-medium">{widget.name}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6">
                <MoreHorizontal className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRefresh}>
                <RefreshCw className="mr-2 size-4" />
                Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleFullWidth}>
                {isFullWidth ? (
                  <>
                    <Minimize2 className="mr-2 size-4" />
                    Reset Width
                  </>
                ) : (
                  <>
                    <Maximize2 className="mr-2 size-4" />
                    Full Width
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Settings className="mr-2 size-4" />
                Configure
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-400" onClick={handleDelete}>
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0 min-h-0 overflow-hidden">
        <WidgetContent widget={widget} data={widgetData} isLoading={isLoading} />
      </CardContent>

      {/* Edit Widget Dialog */}
      <EditWidgetDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        dashboardId={dashboardId}
        widget={widget}
      />
    </Card>
  )
}

interface WidgetContentProps {
  widget: Widget
  data: ReturnType<typeof useDashboardStore.getState>['widgetData'] extends Map<string, infer T>
    ? T | undefined
    : never
  isLoading: boolean
}

/**
 * Selects and renders the appropriate content for a dashboard widget based on loading state and fetched data.
 *
 * When `isLoading` is true a centered spinner is shown. If `data` is absent a "No data" message is shown.
 * If `data.success` is false an error message is displayed. When valid data is present the function
 * renders the widget-specific content for `chart`, `kpi`, or `table`; unknown types render a fallback message.
 *
 * @param widget - The widget definition whose configuration determines which content is rendered
 * @param data - The fetched widget data response; expected shape includes `success`, optional `error`, and `data` (records)
 * @param isLoading - Whether the widget's data is currently loading
 * @returns The rendered widget content element
 */
function WidgetContent({ widget, data, isLoading }: WidgetContentProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  if (!data.success) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        {data.error || 'Failed to load data'}
      </div>
    )
  }

  switch (widget.config.widgetType) {
    case 'chart':
      return <ChartWidgetContent widget={widget} data={data.data || []} />
    case 'kpi':
      return <KPIWidgetContent widget={widget} data={data.data || []} />
    case 'table':
      return <TableWidgetContent widget={widget} data={data.data || []} />
    default:
      return <div className="text-sm text-muted-foreground">Unknown widget type</div>
  }
}

/**
 * Render the chart-specific content for a widget.
 *
 * Renders a full-size container with the WidgetChart when the widget's
 * configuration indicates a chart; returns `null` otherwise.
 *
 * @param widget - The widget object; its `config.widgetType` must be `'chart'` for chart content to render.
 * @param data - Array of record objects provided to the chart as input data.
 * @returns The chart content element, or `null` if the widget is not a chart.
 */
function ChartWidgetContent({ widget, data }: { widget: Widget; data: Record<string, unknown>[] }) {
  if (widget.config.widgetType !== 'chart') return null
  return (
    <div className="h-full w-full">
      <WidgetChart config={widget.config as ChartWidgetConfig} data={data} />
    </div>
  )
}

/**
 * Render KPI-specific widget content when the widget is a KPI.
 *
 * @param widget - The widget whose config should be a KPI configuration; if its `widgetType` is not `'kpi'`, nothing is rendered.
 * @param data - Array of data records to pass to the KPI widget.
 * @returns The KPI widget element when `widget.config.widgetType === 'kpi'`, `null` otherwise.
 */
function KPIWidgetContent({ widget, data }: { widget: Widget; data: Record<string, unknown>[] }) {
  if (widget.config.widgetType !== 'kpi') return null
  return <WidgetKPI config={widget.config as KPIWidgetConfig} data={data} />
}

/**
 * Render the table-specific content for a widget when its type is `table`.
 *
 * @param widget - The widget whose table configuration will be used to render content.
 * @param data - Array of row records to be displayed in the table.
 * @returns The rendered table component for the widget, or `null` if the widget is not a table.
 */
function TableWidgetContent({ widget, data }: { widget: Widget; data: Record<string, unknown>[] }) {
  if (widget.config.widgetType !== 'table') return null
  return <WidgetTable config={widget.config as TableWidgetConfig} data={data} />
}
