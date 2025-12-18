import { useCallback } from 'react'
import { ReactGridLayout } from 'react-grid-layout/legacy'

import { useDashboardStore } from '@/stores'
import { WidgetCard } from './widget-card'
import type { Dashboard, WidgetLayout } from '@shared/index'

import 'react-grid-layout/css/styles.css'

interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

interface DashboardGridProps {
  dashboard: Dashboard
  editMode: boolean
}

/**
 * Render a dashboard's widget grid and synchronize layout changes with the store.
 *
 * Renders widgets inside a responsive grid and updates the dashboard's widget layouts when the user repositions or resizes items.
 *
 * @param dashboard - Dashboard object containing widgets and layout configuration used to build the grid
 * @param editMode - When `true`, enables dragging and resizing of widgets in the grid
 * @returns A React element that renders the dashboard grid and its WidgetCard children
 */
export function DashboardGrid({ dashboard, editMode }: DashboardGridProps) {
  const updateWidgetLayouts = useDashboardStore((s) => s.updateWidgetLayouts)

  const layout: GridLayoutItem[] = dashboard.widgets.map((widget) => ({
    i: widget.id,
    x: widget.layout.x,
    y: widget.layout.y,
    w: widget.layout.w,
    h: widget.layout.h,
    minW: widget.layout.minW || 2,
    minH: widget.layout.minH || 2
  }))

  const handleLayoutChange = useCallback(
    (newLayout: readonly GridLayoutItem[]) => {
      const layouts: Record<string, WidgetLayout> = {}
      for (const item of newLayout) {
        layouts[item.i] = {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: item.minW,
          minH: item.minH
        }
      }
      updateWidgetLayouts(dashboard.id, layouts)
    },
    [dashboard.id, updateWidgetLayouts]
  )

  return (
    <div className="flex-1 overflow-auto p-4">
      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={dashboard.layoutCols}
        rowHeight={100}
        width={1200}
        isDraggable={editMode}
        isResizable={editMode}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-drag-handle"
      >
        {dashboard.widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetCard widget={widget} dashboardId={dashboard.id} editMode={editMode} />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  )
}
