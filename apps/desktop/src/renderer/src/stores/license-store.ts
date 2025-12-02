import { create } from 'zustand'
import type { LicenseStatus, LicenseType } from '@shared/index'

interface LicenseState {
  // License status
  status: LicenseStatus | null
  isLoading: boolean
  error: string | null

  // Modal states
  isActivationModalOpen: boolean
  isSettingsModalOpen: boolean

  // Actions
  checkLicense: () => Promise<void>
  activateLicense: (key: string, email: string) => Promise<{ success: boolean; error?: string }>
  activateLicenseOffline: (
    key: string,
    email: string,
    type?: LicenseType,
    daysValid?: number
  ) => Promise<{ success: boolean; error?: string }>
  deactivateLicense: () => Promise<{ success: boolean; error?: string }>
  openCustomerPortal: () => Promise<{ success: boolean; error?: string }>

  // Modal actions
  openActivationModal: () => void
  closeActivationModal: () => void
  openSettingsModal: () => void
  closeSettingsModal: () => void

  // Computed
  isPersonal: () => boolean
  isCommercial: () => boolean
  isExpired: () => boolean
  isExpiringSoon: () => boolean
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  // Initial state
  status: null,
  isLoading: false,
  error: null,
  isActivationModalOpen: false,
  isSettingsModalOpen: false,

  // Actions
  checkLicense: async () => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.license.check()

      if (result.success && result.data) {
        set({
          status: result.data,
          isLoading: false,
          error: null
        })
      } else {
        set({
          isLoading: false,
          error: result.error || 'Failed to check license'
        })
      }
    } catch (error) {
      console.error('Failed to check license:', error)
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  activateLicense: async (key: string, email: string) => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.license.activate({ key, email })

      if (result.success && result.data) {
        set({
          status: result.data,
          isLoading: false,
          error: null,
          isActivationModalOpen: false
        })
        return { success: true }
      } else {
        const error = result.error || 'Failed to activate license'
        set({
          isLoading: false,
          error
        })
        return { success: false, error }
      }
    } catch (error) {
      console.error('Failed to activate license:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      set({
        isLoading: false,
        error: errorMsg
      })
      return { success: false, error: errorMsg }
    }
  },

  activateLicenseOffline: async (
    key: string,
    email: string,
    type?: LicenseType,
    daysValid?: number
  ) => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.license.activateOffline(key, email, type, daysValid)

      if (result.success && result.data) {
        set({
          status: result.data,
          isLoading: false,
          error: null,
          isActivationModalOpen: false
        })
        return { success: true }
      } else {
        const error = result.error || 'Failed to activate license'
        set({
          isLoading: false,
          error
        })
        return { success: false, error }
      }
    } catch (error) {
      console.error('Failed to activate license offline:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      set({
        isLoading: false,
        error: errorMsg
      })
      return { success: false, error: errorMsg }
    }
  },

  deactivateLicense: async () => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.license.deactivate()

      if (result.success) {
        // Recheck license to get personal status
        await get().checkLicense()
        set({
          isLoading: false,
          error: null,
          isSettingsModalOpen: false
        })
        return { success: true }
      } else {
        const error = result.error || 'Failed to deactivate license'
        set({
          isLoading: false,
          error
        })
        return { success: false, error }
      }
    } catch (error) {
      console.error('Failed to deactivate license:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      set({
        isLoading: false,
        error: errorMsg
      })
      return { success: false, error: errorMsg }
    }
  },

  openCustomerPortal: async () => {
    set({ isLoading: true, error: null })

    try {
      const result = await window.api.license.openCustomerPortal()

      if (result.success) {
        set({ isLoading: false, error: null })
        return { success: true }
      } else {
        const error = result.error || 'Failed to open customer portal'
        set({ isLoading: false, error })
        return { success: false, error }
      }
    } catch (error) {
      console.error('Failed to open customer portal:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      set({ isLoading: false, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  },

  // Modal actions
  openActivationModal: () => set({ isActivationModalOpen: true, error: null }),
  closeActivationModal: () => set({ isActivationModalOpen: false, error: null }),
  openSettingsModal: () => set({ isSettingsModalOpen: true, error: null }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false, error: null }),

  // Computed
  isPersonal: () => {
    const status = get().status
    return status?.type === 'personal'
  },

  isCommercial: () => {
    const status = get().status
    return status?.isCommercial ?? false
  },

  isExpired: () => {
    const status = get().status
    if (!status?.expiresAt) return false
    return new Date(status.expiresAt) < new Date()
  },

  isExpiringSoon: () => {
    const status = get().status
    if (!status?.daysUntilExpiry) return false
    return status.daysUntilExpiry <= 14
  }
}))
