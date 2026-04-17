import { create } from 'zustand'
import type {
  ConnectionConfig,
  SchemaIntelCheckId,
  SchemaIntelReport
} from '@data-peek/shared'

interface IntelState {
  /** Report keyed by connection id, so swapping tabs doesn't clear results. */
  reports: Record<string, SchemaIntelReport>
  /** Currently-running connection ids. */
  running: Record<string, boolean>
  /** Last error message per connection id. */
  errors: Record<string, string | null>

  /** Which check ids the user has enabled, per connection. */
  selectedChecks: Record<string, SchemaIntelCheckId[] | undefined>

  run: (config: ConnectionConfig, checks?: SchemaIntelCheckId[]) => Promise<void>
  setSelectedChecks: (connectionId: string, checks: SchemaIntelCheckId[]) => void
  clear: (connectionId: string) => void
}

export const useIntelStore = create<IntelState>()((set, get) => ({
  reports: {},
  running: {},
  errors: {},
  selectedChecks: {},

  run: async (config, checks) => {
    const id = config.id
    set((s) => ({
      running: { ...s.running, [id]: true },
      errors: { ...s.errors, [id]: null }
    }))
    try {
      const checksToRun = checks ?? get().selectedChecks[id]
      const result = await window.api.intel.run(config, checksToRun)
      if (result.success && result.data) {
        set((s) => ({
          reports: { ...s.reports, [id]: result.data! },
          errors: { ...s.errors, [id]: null }
        }))
      } else {
        set((s) => ({
          errors: { ...s.errors, [id]: result.error || 'Unknown error' }
        }))
      }
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, [id]: String(err) } }))
    } finally {
      set((s) => ({ running: { ...s.running, [id]: false } }))
    }
  },

  setSelectedChecks: (connectionId, checks) => {
    set((s) => ({
      selectedChecks: { ...s.selectedChecks, [connectionId]: checks }
    }))
  },

  clear: (connectionId) => {
    set((s) => {
      const reports = { ...s.reports }
      const errors = { ...s.errors }
      delete reports[connectionId]
      delete errors[connectionId]
      return { reports, errors }
    })
  }
}))
