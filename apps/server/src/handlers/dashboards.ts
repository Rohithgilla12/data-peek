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
} from '../desktop-imports.js'

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void
type BroadcastFn = (event: string, data?: any) => void

function wrap(fn: () => any) {
  try {
    const result = fn()
    return { success: true, data: result }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}

function notFound(entity: string) {
  return { success: false, error: `${entity} not found` }
}

export function registerDashboardHandlers(register: RegisterFn, broadcast: BroadcastFn): void {
  register('dashboards:list', async () => wrap(() => listDashboards()))

  register('dashboards:get', async (id: string) => {
    const d = getDashboard(id)
    return d ? { success: true, data: d } : notFound('Dashboard')
  })

  register('dashboards:create', async (input: CreateDashboardInput) =>
    wrap(() => createDashboard(input)))

  register('dashboards:update', async ({ id, updates }: { id: string; updates: UpdateDashboardInput }) => {
    const d = updateDashboard(id, updates)
    return d ? { success: true, data: d } : notFound('Dashboard')
  })

  register('dashboards:delete', async (id: string) => {
    const deleted = deleteDashboard(id)
    return deleted ? { success: true } : notFound('Dashboard')
  })

  register('dashboards:duplicate', async (id: string) => {
    const d = duplicateDashboard(id)
    return d ? { success: true, data: d } : notFound('Dashboard')
  })

  register('dashboards:add-widget', async ({ dashboardId, widget }: { dashboardId: string; widget: CreateWidgetInput }) => {
    const w = addWidget(dashboardId, widget)
    return w ? { success: true, data: w } : notFound('Dashboard')
  })

  register('dashboards:update-widget', async ({ dashboardId, widgetId, updates }: { dashboardId: string; widgetId: string; updates: UpdateWidgetInput }) => {
    const w = updateWidget(dashboardId, widgetId, updates)
    return w ? { success: true, data: w } : notFound('Widget')
  })

  register('dashboards:delete-widget', async ({ dashboardId, widgetId }: { dashboardId: string; widgetId: string }) => {
    const deleted = deleteWidget(dashboardId, widgetId)
    return deleted ? { success: true } : notFound('Widget')
  })

  register('dashboards:update-widget-layouts', async ({ dashboardId, layouts }: { dashboardId: string; layouts: Record<string, WidgetLayout> }) => {
    const d = updateWidgetLayouts(dashboardId, layouts)
    return d ? { success: true, data: d } : notFound('Dashboard')
  })

  register('dashboards:execute-widget', async (widget: Widget) => {
    try {
      const result = await executeWidget(widget)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('dashboards:execute-all-widgets', async (dashboardId: string) => {
    try {
      const results = await executeAllWidgets(dashboardId)
      broadcast('dashboard:refresh-complete', { dashboardId, results })
      return { success: true, data: results }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('dashboards:get-by-tag', async (tag: string) =>
    wrap(() => getDashboardsByTag(tag)))

  register('dashboards:get-all-tags', async () =>
    wrap(() => getAllDashboardTags()))

  register('dashboards:update-refresh-schedule', async ({ dashboardId, schedule }: { dashboardId: string; schedule: Dashboard['refreshSchedule'] }) => {
    const d = updateDashboardRefreshSchedule(dashboardId, schedule)
    return d ? { success: true, data: d } : notFound('Dashboard')
  })

  register('dashboards:get-next-refresh-time', async (schedule: NonNullable<Dashboard['refreshSchedule']>) =>
    wrap(() => getNextRefreshTime(schedule)))

  register('dashboards:validate-cron', async (expression: string) =>
    wrap(() => validateCronExpression(expression)))

  register('dashboards:get-next-refresh-times', async ({ expression, count, timezone }: { expression: string; count?: number; timezone?: string }) =>
    wrap(() => getNextRefreshTimes(expression, count, timezone)))
}
