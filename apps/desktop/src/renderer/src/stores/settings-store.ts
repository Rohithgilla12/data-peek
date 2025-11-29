import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface AppSettings {
  // Query editor settings
  hideQueryEditorByDefault: boolean
  // JSON display settings
  expandJsonByDefault: boolean
  jsonExpandDepth: number
}

interface SettingsState extends AppSettings {
  // Actions
  setHideQueryEditorByDefault: (value: boolean) => void
  setExpandJsonByDefault: (value: boolean) => void
  setJsonExpandDepth: (depth: number) => void
  resetSettings: () => void
}

const defaultSettings: AppSettings = {
  hideQueryEditorByDefault: false,
  expandJsonByDefault: false,
  jsonExpandDepth: 2
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setHideQueryEditorByDefault: (value) => set({ hideQueryEditorByDefault: value }),
      setExpandJsonByDefault: (value) => set({ expandJsonByDefault: value }),
      setJsonExpandDepth: (depth) => set({ jsonExpandDepth: depth }),
      resetSettings: () => set(defaultSettings)
    }),
    {
      name: 'data-peek-settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
