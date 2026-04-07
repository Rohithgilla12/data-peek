import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { FilterChip } from '@/components/smart-filter-bar'

function makeFilterKey(connectionId: string, schema: string, table: string): string {
  return `${connectionId}:${schema}.${table}`
}

interface FilterState {
  savedFilters: Record<string, FilterChip[]>
  saveFilters: (connectionId: string, schema: string, table: string, chips: FilterChip[]) => void
  getFilters: (connectionId: string, schema: string, table: string) => FilterChip[]
  clearFilters: (connectionId: string, schema: string, table: string) => void
  clearAllFilters: () => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      savedFilters: {},
      saveFilters: (connectionId, schema, table, chips) => {
        const key = makeFilterKey(connectionId, schema, table)
        if (chips.length === 0) {
          set((state) => {
            const next = { ...state.savedFilters }
            delete next[key]
            return { savedFilters: next }
          })
        } else {
          set((state) => ({
            savedFilters: { ...state.savedFilters, [key]: chips }
          }))
        }
      },
      getFilters: (connectionId, schema, table) => {
        const key = makeFilterKey(connectionId, schema, table)
        return get().savedFilters[key] ?? []
      },
      clearFilters: (connectionId, schema, table) => {
        const key = makeFilterKey(connectionId, schema, table)
        set((state) => {
          const next = { ...state.savedFilters }
          delete next[key]
          return { savedFilters: next }
        })
      },
      clearAllFilters: () => set({ savedFilters: {} })
    }),
    {
      name: 'data-peek-filters',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
