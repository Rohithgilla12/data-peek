import { create } from 'zustand'
import type {
  Dashboard,
  Widget,
  WidgetRunResult,
  CreateDashboardInput,
  UpdateDashboardInput,
  CreateWidgetInput,
  UpdateWidgetInput,
  WidgetLayout
} from '@shared/index'

interface DashboardState {
  dashboards: Dashboard[]
  activeDashboardId: string | null
  widgetData: Map<string, WidgetRunResult>
  widgetLoadingState: Map<string, boolean>
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  editMode: boolean

  initialize: () => Promise<void>
  refresh: () => Promise<void>

  createDashboard: (input: CreateDashboardInput) => Promise<Dashboard | null>
  updateDashboard: (id: string, updates: UpdateDashboardInput) => Promise<void>
  deleteDashboard: (id: string) => Promise<void>
  duplicateDashboard: (id: string) => Promise<Dashboard | null>

  setActiveDashboard: (id: string | null) => void
  setEditMode: (editMode: boolean) => void

  addWidget: (dashboardId: string, widget: CreateWidgetInput) => Promise<Widget | null>
  updateWidget: (dashboardId: string, widgetId: string, updates: UpdateWidgetInput) => Promise<void>
  deleteWidget: (dashboardId: string, widgetId: string) => Promise<void>
  updateWidgetLayouts: (dashboardId: string, layouts: Record<string, WidgetLayout>) => Promise<void>

  refreshWidget: (widget: Widget) => Promise<void>
  refreshAllWidgets: (dashboardId: string) => Promise<void>

  getWidgetData: (widgetId: string) => WidgetRunResult | undefined
  isWidgetLoading: (widgetId: string) => boolean

  getDashboardsByTag: (tag: string) => Dashboard[]
  getAllTags: () => string[]
  getActiveDashboard: () => Dashboard | undefined

  updateRefreshSchedule: (
    dashboardId: string,
    schedule: Dashboard['refreshSchedule']
  ) => Promise<void>
  subscribeToAutoRefresh: () => () => void
  handleAutoRefreshResults: (dashboardId: string, results: WidgetRunResult[]) => void

  exportDashboard: (dashboardId: string) => string | null
  importDashboard: (jsonData: string) => Promise<Dashboard | null>
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboardId: null,
  widgetData: new Map(),
  widgetLoadingState: new Map(),
  isLoading: false,
  isInitialized: false,
  error: null,
  editMode: false,

  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true, error: null })

    try {
      const result = await window.api.dashboards.list()
      if (result.success && result.data) {
        set({
          dashboards: result.data,
          isLoading: false,
          isInitialized: true
        })
      } else {
        set({
          isLoading: false,
          isInitialized: true,
          error: result.error || 'Failed to load dashboards'
        })
      }
    } catch (error) {
      console.error('Failed to initialize dashboards:', error)
      set({
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  refresh: async () => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.dashboards.list()
      if (result.success && result.data) {
        set({
          dashboards: result.data,
          isLoading: false
        })
      } else {
        set({
          isLoading: false,
          error: result.error || 'Failed to refresh dashboards'
        })
      }
    } catch (error) {
      console.error('Failed to refresh dashboards:', error)
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  createDashboard: async (input) => {
    try {
      const result = await window.api.dashboards.create(input)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: [...state.dashboards, result.data!]
        }))
        return result.data
      } else {
        console.error('Failed to create dashboard:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to create dashboard:', error)
      return null
    }
  },

  updateDashboard: async (id, updates) => {
    try {
      const result = await window.api.dashboards.update(id, updates)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: state.dashboards.map((d) => (d.id === id ? result.data! : d))
        }))
      } else {
        console.error('Failed to update dashboard:', result.error)
      }
    } catch (error) {
      console.error('Failed to update dashboard:', error)
    }
  },

  deleteDashboard: async (id) => {
    try {
      const result = await window.api.dashboards.delete(id)
      if (result.success) {
        set((state) => {
          const newWidgetData = new Map(state.widgetData)
          const dashboard = state.dashboards.find((d) => d.id === id)
          if (dashboard) {
            for (const widget of dashboard.widgets) {
              newWidgetData.delete(widget.id)
            }
          }

          return {
            dashboards: state.dashboards.filter((d) => d.id !== id),
            activeDashboardId: state.activeDashboardId === id ? null : state.activeDashboardId,
            widgetData: newWidgetData
          }
        })
      } else {
        console.error('Failed to delete dashboard:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete dashboard:', error)
    }
  },

  duplicateDashboard: async (id) => {
    try {
      const result = await window.api.dashboards.duplicate(id)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: [...state.dashboards, result.data!]
        }))
        return result.data
      } else {
        console.error('Failed to duplicate dashboard:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error)
      return null
    }
  },

  setActiveDashboard: (id) => {
    set({ activeDashboardId: id })
  },

  setEditMode: (editMode) => {
    set({ editMode })
  },

  addWidget: async (dashboardId, widget) => {
    try {
      const result = await window.api.dashboards.addWidget(dashboardId, widget)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: state.dashboards.map((d) =>
            d.id === dashboardId ? { ...d, widgets: [...d.widgets, result.data!] } : d
          )
        }))
        return result.data
      } else {
        console.error('Failed to add widget:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to add widget:', error)
      return null
    }
  },

  updateWidget: async (dashboardId, widgetId, updates) => {
    try {
      const result = await window.api.dashboards.updateWidget(dashboardId, widgetId, updates)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: state.dashboards.map((d) =>
            d.id === dashboardId
              ? {
                  ...d,
                  widgets: d.widgets.map((w) => (w.id === widgetId ? result.data! : w))
                }
              : d
          )
        }))
      } else {
        console.error('Failed to update widget:', result.error)
      }
    } catch (error) {
      console.error('Failed to update widget:', error)
    }
  },

  deleteWidget: async (dashboardId, widgetId) => {
    try {
      const result = await window.api.dashboards.deleteWidget(dashboardId, widgetId)
      if (result.success) {
        set((state) => {
          const newWidgetData = new Map(state.widgetData)
          newWidgetData.delete(widgetId)

          return {
            dashboards: state.dashboards.map((d) =>
              d.id === dashboardId
                ? { ...d, widgets: d.widgets.filter((w) => w.id !== widgetId) }
                : d
            ),
            widgetData: newWidgetData
          }
        })
      } else {
        console.error('Failed to delete widget:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete widget:', error)
    }
  },

  updateWidgetLayouts: async (dashboardId, layouts) => {
    try {
      const result = await window.api.dashboards.updateWidgetLayouts(dashboardId, layouts)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: state.dashboards.map((d) => (d.id === dashboardId ? result.data! : d))
        }))
      } else {
        console.error('Failed to update widget layouts:', result.error)
      }
    } catch (error) {
      console.error('Failed to update widget layouts:', error)
    }
  },

  refreshWidget: async (widget) => {
    set((state) => {
      const newLoadingState = new Map(state.widgetLoadingState)
      newLoadingState.set(widget.id, true)
      return { widgetLoadingState: newLoadingState }
    })

    try {
      const result = await window.api.dashboards.executeWidget(widget)
      if (result.success && result.data) {
        set((state) => {
          const newWidgetData = new Map(state.widgetData)
          const newLoadingState = new Map(state.widgetLoadingState)
          newWidgetData.set(widget.id, result.data!)
          newLoadingState.set(widget.id, false)
          return { widgetData: newWidgetData, widgetLoadingState: newLoadingState }
        })
      } else {
        set((state) => {
          const newWidgetData = new Map(state.widgetData)
          const newLoadingState = new Map(state.widgetLoadingState)
          newWidgetData.set(widget.id, {
            widgetId: widget.id,
            success: false,
            error: result.error || 'Failed to execute widget',
            durationMs: 0,
            rowCount: 0,
            executedAt: Date.now()
          })
          newLoadingState.set(widget.id, false)
          return { widgetData: newWidgetData, widgetLoadingState: newLoadingState }
        })
      }
    } catch (error) {
      console.error('Failed to refresh widget:', error)
      set((state) => {
        const newWidgetData = new Map(state.widgetData)
        const newLoadingState = new Map(state.widgetLoadingState)
        newWidgetData.set(widget.id, {
          widgetId: widget.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0,
          rowCount: 0,
          executedAt: Date.now()
        })
        newLoadingState.set(widget.id, false)
        return { widgetData: newWidgetData, widgetLoadingState: newLoadingState }
      })
    }
  },

  refreshAllWidgets: async (dashboardId) => {
    const dashboard = get().dashboards.find((d) => d.id === dashboardId)
    if (!dashboard) return

    set((state) => {
      const newLoadingState = new Map(state.widgetLoadingState)
      for (const widget of dashboard.widgets) {
        newLoadingState.set(widget.id, true)
      }
      return { widgetLoadingState: newLoadingState }
    })

    try {
      const result = await window.api.dashboards.executeAllWidgets(dashboardId)
      if (result.success && result.data) {
        set((state) => {
          const newWidgetData = new Map(state.widgetData)
          const newLoadingState = new Map(state.widgetLoadingState)

          for (const widgetResult of result.data!) {
            newWidgetData.set(widgetResult.widgetId, widgetResult)
            newLoadingState.set(widgetResult.widgetId, false)
          }

          return { widgetData: newWidgetData, widgetLoadingState: newLoadingState }
        })
      } else {
        set((state) => {
          const newLoadingState = new Map(state.widgetLoadingState)
          for (const widget of dashboard.widgets) {
            newLoadingState.set(widget.id, false)
          }
          return { widgetLoadingState: newLoadingState }
        })
      }
    } catch (error) {
      console.error('Failed to refresh all widgets:', error)
      set((state) => {
        const newLoadingState = new Map(state.widgetLoadingState)
        for (const widget of dashboard.widgets) {
          newLoadingState.set(widget.id, false)
        }
        return { widgetLoadingState: newLoadingState }
      })
    }
  },

  getWidgetData: (widgetId) => {
    return get().widgetData.get(widgetId)
  },

  isWidgetLoading: (widgetId) => {
    return get().widgetLoadingState.get(widgetId) || false
  },

  getDashboardsByTag: (tag) => {
    return get().dashboards.filter((d) => d.tags.includes(tag))
  },

  getAllTags: () => {
    const tags = new Set<string>()
    for (const dashboard of get().dashboards) {
      for (const tag of dashboard.tags) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  },

  getActiveDashboard: () => {
    const { dashboards, activeDashboardId } = get()
    return dashboards.find((d) => d.id === activeDashboardId)
  },

  updateRefreshSchedule: async (dashboardId, schedule) => {
    try {
      const result = await window.api.dashboards.updateRefreshSchedule(dashboardId, schedule)
      if (result.success && result.data) {
        set((state) => ({
          dashboards: state.dashboards.map((d) => (d.id === dashboardId ? result.data! : d))
        }))
      } else {
        console.error('Failed to update refresh schedule:', result.error)
      }
    } catch (error) {
      console.error('Failed to update refresh schedule:', error)
    }
  },

  subscribeToAutoRefresh: () => {
    return window.api.dashboards.onRefreshComplete(({ dashboardId, results }) => {
      get().handleAutoRefreshResults(dashboardId, results)
    })
  },

  handleAutoRefreshResults: (dashboardId, results) => {
    const { activeDashboardId } = get()
    if (activeDashboardId !== dashboardId) return

    set((state) => {
      const newWidgetData = new Map(state.widgetData)
      const newLoadingState = new Map(state.widgetLoadingState)

      for (const widgetResult of results) {
        newWidgetData.set(widgetResult.widgetId, widgetResult)
        newLoadingState.set(widgetResult.widgetId, false)
      }

      return { widgetData: newWidgetData, widgetLoadingState: newLoadingState }
    })
  },

  exportDashboard: (dashboardId) => {
    const dashboard = get().dashboards.find((d) => d.id === dashboardId)
    if (!dashboard) return null

    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      dashboard: {
        ...dashboard,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        version: undefined,
        syncId: undefined,
        widgets: dashboard.widgets.map((w) => ({
          ...w,
          id: undefined,
          createdAt: undefined,
          updatedAt: undefined
        }))
      }
    }

    return JSON.stringify(exportData, null, 2)
  },

  importDashboard: async (jsonData) => {
    try {
      const parsed = JSON.parse(jsonData)
      if (!parsed.dashboard || !parsed.dashboard.name) {
        console.error('Invalid dashboard export format')
        return null
      }

      const input: CreateDashboardInput = {
        name: `${parsed.dashboard.name} (Imported)`,
        description: parsed.dashboard.description,
        tags: parsed.dashboard.tags || [],
        widgets: parsed.dashboard.widgets || [],
        layoutCols: parsed.dashboard.layoutCols || 12,
        refreshSchedule: parsed.dashboard.refreshSchedule
      }

      return get().createDashboard(input)
    } catch (error) {
      console.error('Failed to import dashboard:', error)
      return null
    }
  }
}))
