import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'

export interface AutoMaskRule {
  id: string
  pattern: string
  enabled: boolean
}

const DEFAULT_RULES: AutoMaskRule[] = [
  { id: 'email', pattern: 'email', enabled: true },
  { id: 'password', pattern: 'password|passwd|pwd', enabled: true },
  { id: 'ssn', pattern: 'ssn|social_security', enabled: true },
  { id: 'token', pattern: 'token|secret|api_key|apikey', enabled: true },
  { id: 'phone', pattern: 'phone|mobile|cell', enabled: false },
  { id: 'address', pattern: 'address|street', enabled: false }
]

interface MaskingState {
  maskedColumns: Record<string, string[]>
  autoMaskRules: AutoMaskRule[]
  hoverToPeek: boolean
  autoMaskEnabled: boolean

  maskColumn: (tabId: string, columnName: string) => void
  unmaskColumn: (tabId: string, columnName: string) => void
  toggleColumnMask: (tabId: string, columnName: string) => void
  unmaskAll: (tabId: string) => void
  isColumnMasked: (tabId: string, columnName: string) => boolean
  getMaskedColumnsForTab: (tabId: string) => Set<string>
  getEffectiveMaskedColumns: (tabId: string, allColumns: string[]) => Set<string>
  updateAutoMaskRule: (id: string, updates: Partial<AutoMaskRule>) => void
  addAutoMaskRule: (pattern: string) => void
  removeAutoMaskRule: (id: string) => void
  setHoverToPeek: (enabled: boolean) => void
  setAutoMaskEnabled: (enabled: boolean) => void
}

export const useMaskingStore = create<MaskingState>()(
  persist(
    (set, get) => ({
      maskedColumns: {},
      autoMaskRules: DEFAULT_RULES,
      hoverToPeek: true,
      autoMaskEnabled: true,

      maskColumn: (tabId, columnName) =>
        set((state) => {
          const existing = state.maskedColumns[tabId] ?? []
          if (existing.includes(columnName)) return state
          return {
            maskedColumns: {
              ...state.maskedColumns,
              [tabId]: [...existing, columnName]
            }
          }
        }),

      unmaskColumn: (tabId, columnName) =>
        set((state) => {
          const existing = state.maskedColumns[tabId] ?? []
          return {
            maskedColumns: {
              ...state.maskedColumns,
              [tabId]: existing.filter((c) => c !== columnName)
            }
          }
        }),

      toggleColumnMask: (tabId, columnName) => {
        const { isColumnMasked, maskColumn, unmaskColumn } = get()
        if (isColumnMasked(tabId, columnName)) {
          unmaskColumn(tabId, columnName)
        } else {
          maskColumn(tabId, columnName)
        }
      },

      unmaskAll: (tabId) =>
        set((state) => ({
          maskedColumns: {
            ...state.maskedColumns,
            [tabId]: []
          }
        })),

      isColumnMasked: (tabId, columnName) => {
        const { maskedColumns } = get()
        return (maskedColumns[tabId] ?? []).includes(columnName)
      },

      getMaskedColumnsForTab: (tabId) => {
        const { maskedColumns } = get()
        return new Set(maskedColumns[tabId] ?? [])
      },

      getEffectiveMaskedColumns: (tabId, allColumns) => {
        const { maskedColumns, autoMaskRules, autoMaskEnabled } = get()
        const manualMasked = new Set(maskedColumns[tabId] ?? [])

        if (!autoMaskEnabled) return manualMasked

        const effective = new Set(manualMasked)
        for (const col of allColumns) {
          for (const rule of autoMaskRules) {
            if (!rule.enabled) continue
            try {
              const regex = new RegExp(rule.pattern, 'i')
              if (regex.test(col)) {
                effective.add(col)
                break
              }
            } catch {
              // Invalid regex — skip
            }
          }
        }
        return effective
      },

      updateAutoMaskRule: (id, updates) =>
        set((state) => ({
          autoMaskRules: state.autoMaskRules.map((r) => (r.id === id ? { ...r, ...updates } : r))
        })),

      addAutoMaskRule: (pattern) =>
        set((state) => ({
          autoMaskRules: [...state.autoMaskRules, { id: nanoid(), pattern, enabled: true }]
        })),

      removeAutoMaskRule: (id) =>
        set((state) => ({
          autoMaskRules: state.autoMaskRules.filter((r) => r.id !== id)
        })),

      setHoverToPeek: (enabled) => set({ hoverToPeek: enabled }),

      setAutoMaskEnabled: (enabled) => set({ autoMaskEnabled: enabled })
    }),
    {
      name: 'masking-store',
      partialize: (state) => ({
        autoMaskRules: state.autoMaskRules,
        hoverToPeek: state.hoverToPeek,
        autoMaskEnabled: state.autoMaskEnabled
      })
    }
  )
)
