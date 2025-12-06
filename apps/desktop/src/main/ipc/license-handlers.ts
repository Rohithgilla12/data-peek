import { ipcMain, shell } from 'electron'
import type { LicenseActivationRequest } from '@shared/index'
import {
  checkLicense,
  activateLicense,
  deactivateLicense,
  activateLicenseOffline,
  getCustomerPortalUrl
} from '../license-service'

/**
 * Register license management handlers
 */
export function registerLicenseHandlers(): void {
  // Check current license status
  ipcMain.handle('license:check', async () => {
    try {
      const status = await checkLicense()
      return { success: true, data: status }
    } catch (error: unknown) {
      console.error('[license-handlers] Check error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Activate a license
  ipcMain.handle('license:activate', async (_, request: LicenseActivationRequest) => {
    console.log('[license-handlers] Activating license for:', request.email)
    try {
      const result = await activateLicense(request.key, request.email)
      if (result.success) {
        const status = await checkLicense()
        return { success: true, data: status }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      console.error('[license-handlers] Activation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Deactivate the current license
  ipcMain.handle('license:deactivate', async () => {
    console.log('[license-handlers] Deactivating license')
    try {
      const result = await deactivateLicense()
      return { success: result.success, error: result.error }
    } catch (error: unknown) {
      console.error('[license-handlers] Deactivation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Offline activation (for development/testing)
  ipcMain.handle(
    'license:activate-offline',
    async (
      _,
      {
        key,
        email,
        type,
        daysValid
      }: { key: string; email: string; type?: 'individual' | 'team'; daysValid?: number }
    ) => {
      console.log('[license-handlers] Offline activation for:', email)
      try {
        activateLicenseOffline(key, email, type, daysValid)
        const status = await checkLicense()
        return { success: true, data: status }
      } catch (error: unknown) {
        console.error('[license-handlers] Offline activation error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get customer portal URL for managing subscription
  ipcMain.handle('license:customer-portal', async () => {
    console.log('[license-handlers] Getting customer portal URL')
    try {
      const result = await getCustomerPortalUrl()
      if (result.success && result.url) {
        // Open the customer portal in the default browser
        shell.openExternal(result.url)
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      console.error('[license-handlers] Customer portal error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
