import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PageSizeOption = 25 | 50 | 100 | 250 | 500

export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [25, 50, 100, 250, 500]

export interface AppSettings {
  // Query editor settings
  hideQueryEditorByDefault: boolean
  // JSON display settings
  expandJsonByDefault: boolean
  hideQuickQueryPanel: boolean
  jsonExpandDepth: number
  // Database settings
  /** Query timeout in milliseconds (0 = no timeout) */
  queryTimeoutMs: number
  // Pagination settings
  /** Default page size for data tables */
  defaultPageSize: PageSizeOption
}

interface SettingsState extends AppSettings {
  // Actions
  setHideQueryEditorByDefault: (value: boolean) => void
  setExpandJsonByDefault: (value: boolean) => void
  setJsonExpandDepth: (depth: number) => void
  setQueryTimeoutMs: (value: number) => void
  setDefaultPageSize: (size: PageSizeOption) => void
  resetSettings: () => void
  setHideQuickQueryPanel: (value: boolean) => void
}

const defaultSettings: AppSettings = {
  hideQueryEditorByDefault: false,
  expandJsonByDefault: false,
  jsonExpandDepth: 2,
  hideQuickQueryPanel: true,
  queryTimeoutMs: 0, // 0 = no timeout
  defaultPageSize: 100
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setHideQueryEditorByDefault: (value) => set({ hideQueryEditorByDefault: value }),
      setExpandJsonByDefault: (value) => set({ expandJsonByDefault: value }),
      setJsonExpandDepth: (depth) => set({ jsonExpandDepth: depth }),
      setQueryTimeoutMs: (value) => set({ queryTimeoutMs: value }),
      setDefaultPageSize: (size) => set({ defaultPageSize: size }),
      setHideQuickQueryPanel: (value) => set({ hideQuickQueryPanel: value }),
      resetSettings: () => set(defaultSettings)
    }),
    {
      name: 'data-peek-settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
