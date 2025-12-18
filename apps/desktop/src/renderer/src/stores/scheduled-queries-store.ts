import { create } from 'zustand'
import type {
  ScheduledQuery,
  ScheduledQueryRun,
  CreateScheduledQueryInput,
  UpdateScheduledQueryInput
} from '@shared/index'

interface ScheduledQueryState {
  scheduledQueries: ScheduledQuery[]
  runs: ScheduledQueryRun[]
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  createScheduledQuery: (input: CreateScheduledQueryInput) => Promise<ScheduledQuery | null>
  updateScheduledQuery: (id: string, updates: UpdateScheduledQueryInput) => Promise<void>
  deleteScheduledQuery: (id: string) => Promise<void>
  pauseScheduledQuery: (id: string) => Promise<void>
  resumeScheduledQuery: (id: string) => Promise<void>
  runNow: (id: string) => Promise<ScheduledQueryRun | null>
  loadRuns: (queryId: string, limit?: number) => Promise<void>
  loadAllRuns: (limit?: number) => Promise<void>
  clearRuns: (queryId: string) => Promise<void>
  validateCron: (expression: string) => Promise<{ valid: boolean; error?: string }>
  getNextRunTimes: (expression: string, count?: number) => Promise<number[]>

  // Derived getters
  getByConnection: (connectionId: string) => ScheduledQuery[]
  getByStatus: (status: ScheduledQuery['status']) => ScheduledQuery[]
  getRunsForQuery: (queryId: string) => ScheduledQueryRun[]
}

export const useScheduledQueryStore = create<ScheduledQueryState>((set, get) => ({
  scheduledQueries: [],
  runs: [],
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true, error: null })

    try {
      const result = await window.api.scheduledQueries.list()
      if (result.success && result.data) {
        set({
          scheduledQueries: result.data,
          isLoading: false,
          isInitialized: true
        })
      } else {
        set({
          isLoading: false,
          isInitialized: true,
          error: result.error || 'Failed to load scheduled queries'
        })
      }
    } catch (error) {
      console.error('Failed to initialize scheduled queries:', error)
      set({
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  createScheduledQuery: async (input) => {
    try {
      const result = await window.api.scheduledQueries.create(input)
      if (result.success && result.data) {
        set((state) => ({
          scheduledQueries: [...state.scheduledQueries, result.data!]
        }))
        return result.data
      } else {
        console.error('Failed to create scheduled query:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to create scheduled query:', error)
      return null
    }
  },

  updateScheduledQuery: async (id, updates) => {
    try {
      const result = await window.api.scheduledQueries.update(id, updates)
      if (result.success && result.data) {
        set((state) => ({
          scheduledQueries: state.scheduledQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      } else {
        console.error('Failed to update scheduled query:', result.error)
      }
    } catch (error) {
      console.error('Failed to update scheduled query:', error)
    }
  },

  deleteScheduledQuery: async (id) => {
    try {
      const result = await window.api.scheduledQueries.delete(id)
      if (result.success) {
        set((state) => ({
          scheduledQueries: state.scheduledQueries.filter((q) => q.id !== id),
          runs: state.runs.filter((r) => r.scheduledQueryId !== id)
        }))
      } else {
        console.error('Failed to delete scheduled query:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete scheduled query:', error)
    }
  },

  pauseScheduledQuery: async (id) => {
    try {
      const result = await window.api.scheduledQueries.pause(id)
      if (result.success && result.data) {
        set((state) => ({
          scheduledQueries: state.scheduledQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      } else {
        console.error('Failed to pause scheduled query:', result.error)
      }
    } catch (error) {
      console.error('Failed to pause scheduled query:', error)
    }
  },

  resumeScheduledQuery: async (id) => {
    try {
      const result = await window.api.scheduledQueries.resume(id)
      if (result.success && result.data) {
        set((state) => ({
          scheduledQueries: state.scheduledQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      } else {
        console.error('Failed to resume scheduled query:', result.error)
      }
    } catch (error) {
      console.error('Failed to resume scheduled query:', error)
    }
  },

  runNow: async (id) => {
    try {
      const result = await window.api.scheduledQueries.runNow(id)
      if (result.success && result.data) {
        // Add the run to the local state
        set((state) => ({
          runs: [result.data!, ...state.runs.filter((r) => r.id !== result.data!.id)]
        }))

        // Reload the scheduled query to get updated lastRunAt
        const queryResult = await window.api.scheduledQueries.get(id)
        if (queryResult.success && queryResult.data) {
          set((state) => ({
            scheduledQueries: state.scheduledQueries.map((q) =>
              q.id === id ? queryResult.data! : q
            )
          }))
        }

        return result.data
      } else {
        console.error('Failed to run scheduled query:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to run scheduled query:', error)
      return null
    }
  },

  loadRuns: async (queryId, limit) => {
    try {
      const result = await window.api.scheduledQueries.getRuns(queryId, limit)
      if (result.success && result.data) {
        set((state) => ({
          // Replace runs for this query, keep runs from other queries
          runs: [...state.runs.filter((r) => r.scheduledQueryId !== queryId), ...result.data!]
        }))
      }
    } catch (error) {
      console.error('Failed to load runs:', error)
    }
  },

  loadAllRuns: async (limit) => {
    try {
      const result = await window.api.scheduledQueries.getAllRuns(limit)
      if (result.success && result.data) {
        set({ runs: result.data })
      }
    } catch (error) {
      console.error('Failed to load all runs:', error)
    }
  },

  clearRuns: async (queryId) => {
    try {
      const result = await window.api.scheduledQueries.clearRuns(queryId)
      if (result.success) {
        set((state) => ({
          runs: state.runs.filter((r) => r.scheduledQueryId !== queryId)
        }))
      }
    } catch (error) {
      console.error('Failed to clear runs:', error)
    }
  },

  validateCron: async (expression) => {
    try {
      const result = await window.api.scheduledQueries.validateCron(expression)
      if (result.success && result.data) {
        return result.data
      }
      return { valid: false, error: result.error || 'Validation failed' }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  },

  getNextRunTimes: async (expression, count = 5) => {
    try {
      const result = await window.api.scheduledQueries.getNextRuns(expression, count)
      if (result.success && result.data) {
        return result.data
      }
      return []
    } catch {
      return []
    }
  },

  getByConnection: (connectionId) => {
    return get().scheduledQueries.filter((q) => q.connectionId === connectionId)
  },

  getByStatus: (status) => {
    return get().scheduledQueries.filter((q) => q.status === status)
  },

  getRunsForQuery: (queryId) => {
    return get()
      .runs.filter((r) => r.scheduledQueryId === queryId)
      .sort((a, b) => b.startedAt - a.startedAt)
  }
}))
