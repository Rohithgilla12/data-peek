import type { LicenseActivationRequest } from '@shared/index'
import {
  checkLicense,
  activateLicense,
  deactivateLicense,
  activateLicenseOffline
} from '../desktop-imports.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('license-handlers')

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

export function registerLicenseHandlers(register: RegisterFn): void {
  register('license:check', async () => {
    try {
      const status = await checkLicense()
      return { success: true, data: status }
    } catch (error: unknown) {
      log.error('Check error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('license:activate', async (request: LicenseActivationRequest) => {
    try {
      const result = await activateLicense(request.key, request.email)
      if (result.success) {
        const status = await checkLicense()
        return { success: true, data: status }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      log.error('Activation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('license:deactivate', async () => {
    try {
      const result = await deactivateLicense()
      return { success: result.success, error: result.error }
    } catch (error: unknown) {
      log.error('Deactivation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('license:activate-offline', async ({
    key,
    email,
    type,
    daysValid
  }: {
    key: string
    email: string
    type?: 'individual' | 'team'
    daysValid?: number
  }) => {
    try {
      activateLicenseOffline(key, email, type, daysValid)
      const status = await checkLicense()
      return { success: true, data: status }
    } catch (error: unknown) {
      log.error('Offline activation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
