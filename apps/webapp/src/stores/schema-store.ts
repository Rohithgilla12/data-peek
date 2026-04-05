import { create } from 'zustand'
import type { SchemaInfo } from '@shared/index'

interface SchemaState {
  schemas: SchemaInfo[]
  setSchemas: (schemas: SchemaInfo[]) => void
  expandedSchemas: Set<string>
  expandedTables: Set<string>
  toggleSchema: (name: string) => void
  toggleTable: (key: string) => void
}

export const useSchemaStore = create<SchemaState>((set) => ({
  schemas: [],
  setSchemas: (schemas) => set({ schemas }),
  expandedSchemas: new Set<string>(),
  expandedTables: new Set<string>(),
  toggleSchema: (name) =>
    set((state) => {
      const next = new Set(state.expandedSchemas)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { expandedSchemas: next }
    }),
  toggleTable: (key) =>
    set((state) => {
      const next = new Set(state.expandedTables)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { expandedTables: next }
    }),
}))
