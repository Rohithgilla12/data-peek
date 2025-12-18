import { ipcMain } from 'electron'
import type {
  CreateDashboardInput,
  UpdateDashboardInput,
  CreateWidgetInput,
  UpdateWidgetInput,
  Widget,
  WidgetLayout,
  Dashboard
} from '@shared/index'
import {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  addWidget,
  updateWidget,
  deleteWidget,
  updateWidgetLayouts,
  executeWidget,
  executeAllWidgets,
  getDashboardsByTag,
  getAllDashboardTags,
  updateDashboardRefreshSchedule,
  getNextRefreshTime,
  validateCronExpression,
  getNextRefreshTimes
} from '../dashboard-service'

/**
 * Register IPC handlers under the "dashboards:*" namespace for dashboard and widget operations.
 *
 * Initializes handlers that expose create, read, update, delete, duplicate, widget management,
 * layout updates, execution, tag queries, and refresh/cron utilities to the renderer process.
 * Each handler returns a standardized response object of the form `{ success: boolean, data?: T, error?: string }`
 * and converts service-layer errors or missing resources into appropriate error messages (for example,
 * "Dashboard not found" or "Widget not found").
 */
export function registerDashboardHandlers(): void {
  ipcMain.handle('dashboards:list', () => {
    try {
      const dashboards = listDashboards()
      return { success: true, data: dashboards }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:get', (_, id: string) => {
    try {
      const dashboard = getDashboard(id)
      if (!dashboard) {
        return { success: false, error: 'Dashboard not found' }
      }
      return { success: true, data: dashboard }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:create', (_, input: CreateDashboardInput) => {
    try {
      const dashboard = createDashboard(input)
      return { success: true, data: dashboard }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'dashboards:update',
    (_, { id, updates }: { id: string; updates: UpdateDashboardInput }) => {
      try {
        const dashboard = updateDashboard(id, updates)
        if (!dashboard) {
          return { success: false, error: 'Dashboard not found' }
        }
        return { success: true, data: dashboard }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('dashboards:delete', (_, id: string) => {
    try {
      const deleted = deleteDashboard(id)
      if (!deleted) {
        return { success: false, error: 'Dashboard not found' }
      }
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:duplicate', (_, id: string) => {
    try {
      const dashboard = duplicateDashboard(id)
      if (!dashboard) {
        return { success: false, error: 'Dashboard not found' }
      }
      return { success: true, data: dashboard }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'dashboards:add-widget',
    (_, { dashboardId, widget }: { dashboardId: string; widget: CreateWidgetInput }) => {
      try {
        const newWidget = addWidget(dashboardId, widget)
        if (!newWidget) {
          return { success: false, error: 'Dashboard not found' }
        }
        return { success: true, data: newWidget }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'dashboards:update-widget',
    (
      _,
      {
        dashboardId,
        widgetId,
        updates
      }: { dashboardId: string; widgetId: string; updates: UpdateWidgetInput }
    ) => {
      try {
        const widget = updateWidget(dashboardId, widgetId, updates)
        if (!widget) {
          return { success: false, error: 'Widget not found' }
        }
        return { success: true, data: widget }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'dashboards:delete-widget',
    (_, { dashboardId, widgetId }: { dashboardId: string; widgetId: string }) => {
      try {
        const deleted = deleteWidget(dashboardId, widgetId)
        if (!deleted) {
          return { success: false, error: 'Widget not found' }
        }
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'dashboards:update-widget-layouts',
    (
      _,
      { dashboardId, layouts }: { dashboardId: string; layouts: Record<string, WidgetLayout> }
    ) => {
      try {
        const dashboard = updateWidgetLayouts(dashboardId, layouts)
        if (!dashboard) {
          return { success: false, error: 'Dashboard not found' }
        }
        return { success: true, data: dashboard }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('dashboards:execute-widget', async (_, widget: Widget) => {
    try {
      const result = await executeWidget(widget)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:execute-all-widgets', async (_, dashboardId: string) => {
    try {
      const results = await executeAllWidgets(dashboardId)
      return { success: true, data: results }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:get-by-tag', (_, tag: string) => {
    try {
      const dashboards = getDashboardsByTag(tag)
      return { success: true, data: dashboards }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('dashboards:get-all-tags', () => {
    try {
      const tags = getAllDashboardTags()
      return { success: true, data: tags }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'dashboards:update-refresh-schedule',
    (
      _,
      { dashboardId, schedule }: { dashboardId: string; schedule: Dashboard['refreshSchedule'] }
    ) => {
      try {
        const dashboard = updateDashboardRefreshSchedule(dashboardId, schedule)
        if (!dashboard) {
          return { success: false, error: 'Dashboard not found' }
        }
        return { success: true, data: dashboard }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'dashboards:get-next-refresh-time',
    (_, schedule: NonNullable<Dashboard['refreshSchedule']>) => {
      try {
        const nextTime = getNextRefreshTime(schedule)
        return { success: true, data: nextTime }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('dashboards:validate-cron', (_, expression: string) => {
    try {
      const result = validateCronExpression(expression)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'dashboards:get-next-refresh-times',
    (
      _,
      { expression, count, timezone }: { expression: string; count?: number; timezone?: string }
    ) => {
      try {
        const times = getNextRefreshTimes(expression, count, timezone)
        return { success: true, data: times }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
