import { app } from 'electron'
import * as crypto from 'crypto'
import * as os from 'os'
import type { LicenseData, LicenseStatus, LicenseType } from '@shared/index'
import { DpSecureStorage } from './storage'

let store: DpSecureStorage<{ license?: LicenseData }> | null = null

// License server API URL (placeholder - configure for your server)
const API_URL = process.env.LICENSE_API_URL || 'https://api.data-peek.dev'

// Validation intervals
const VALIDATION_INTERVAL_DAYS = 7
const OFFLINE_GRACE_DAYS = 30

/**
 * Get the app version from package.json
 */
function getAppVersion(): string {
  return app.getVersion()
}

/**
 * Generate a device ID based on machine-specific information
 * Uses hostname, platform, arch, and CPU info
 */
function getDeviceId(): string {
  const machineInfo = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown-cpu',
    os.homedir()
  ].join('|')

  return crypto.createHash('sha256').update(machineInfo).digest('hex')
}

/**
 * Get a human-readable device name
 */
function getDeviceName(): string {
  return `${os.hostname()} (${os.platform()})`
}

/**
 * Get encryption key derived from device ID
 */
function getEncryptionKey(): string {
  const deviceId = getDeviceId()
  return crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 32)
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * Compare version strings (semver format)
 * Returns true if current <= perpetual
 */
function isVersionLessOrEqual(current: string, perpetual: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/[^0-9.]/g, '')
      .split('.')
      .map(Number)
  const [c1 = 0, c2 = 0, c3 = 0] = parse(current)
  const [p1 = 0, p2 = 0, p3 = 0] = parse(perpetual)

  if (c1 !== p1) return c1 < p1
  if (c2 !== p2) return c2 < p2
  return c3 <= p3
}

/**
 * Initialize the license store
 */
export async function initLicenseStore(): Promise<void> {
  if (store) return

  store = await DpSecureStorage.create<{ license?: LicenseData }>({
    name: 'data-peek-license',
    encryptionKey: getEncryptionKey(),
    defaults: {
      license: undefined
    }
  })
}

/**
 * Get the stored license data
 */
export function getStoredLicense(): LicenseData | undefined {
  if (!store) return undefined
  return store.get('license')
}

/**
 * Save license data to storage
 */
function saveLicense(license: LicenseData): void {
  if (!store) return
  store.set('license', license)
}

/**
 * Clear the stored license
 */
function clearLicense(): void {
  if (!store) return
  store.delete('license')
}

/**
 * Update the last validated timestamp
 */
function updateLastValidated(): void {
  const stored = getStoredLicense()
  if (stored) {
    stored.lastValidated = new Date().toISOString()
    saveLicense(stored)
  }
}

/**
 * Get the expired status based on perpetual version
 */
function getExpiredStatus(stored: LicenseData): LicenseStatus {
  const currentVersion = getAppVersion()
  const isPerpetualValid = isVersionLessOrEqual(currentVersion, stored.perpetualVersion)

  return {
    isValid: isPerpetualValid,
    isCommercial: isPerpetualValid,
    type: stored.type,
    expiresAt: stored.expiresAt,
    daysUntilExpiry: 0,
    perpetualVersion: stored.perpetualVersion,
    needsRevalidation: !isPerpetualValid,
    email: stored.email
  }
}

/**
 * Validate license online
 */
async function validateOnline(key: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/licenses/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        deviceId: getDeviceId()
      })
    })

    return response.ok
  } catch {
    // Network error - return false to trigger offline handling
    return false
  }
}

/**
 * Check the current license status
 */
export async function checkLicense(): Promise<LicenseStatus> {
  const stored = getStoredLicense()

  // No license stored = personal use
  if (!stored) {
    return {
      isValid: true,
      isCommercial: false,
      type: 'personal',
      expiresAt: null,
      daysUntilExpiry: null,
      perpetualVersion: null,
      needsRevalidation: false
    }
  }

  const lastValidated = new Date(stored.lastValidated)
  const now = new Date()
  const daysSinceValidation = daysBetween(lastValidated, now)
  const needsRevalidation = daysSinceValidation >= VALIDATION_INTERVAL_DAYS

  if (needsRevalidation) {
    try {
      const validated = await validateOnline(stored.key)
      if (validated) {
        updateLastValidated()
      }
    } catch {
      // Offline - check grace period
      if (daysSinceValidation > OFFLINE_GRACE_DAYS) {
        return getExpiredStatus(stored)
      }
      // Within grace period, allow continued use
    }
  }

  const expiresAt = new Date(stored.expiresAt)

  // Active subscription
  if (expiresAt > now) {
    return {
      isValid: true,
      isCommercial: true,
      type: stored.type,
      expiresAt: stored.expiresAt,
      daysUntilExpiry: daysBetween(now, expiresAt),
      perpetualVersion: stored.perpetualVersion,
      needsRevalidation: false,
      email: stored.email
    }
  }

  // Expired - check perpetual version
  return getExpiredStatus(stored)
}

/**
 * Activate a license
 */
export async function activateLicense(
  licenseKey: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: licenseKey,
        email,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        appVersion: getAppVersion()
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.message || 'Activation failed' }
    }

    // Store license data
    const licenseData: LicenseData = {
      key: licenseKey,
      type: data.type as LicenseType,
      email,
      expiresAt: data.expiresAt,
      perpetualVersion: data.perpetualVersion || getAppVersion(),
      activatedAt: new Date().toISOString(),
      lastValidated: new Date().toISOString()
    }

    saveLicense(licenseData)
    return { success: true }
  } catch (error) {
    console.error('[license] Activation error:', error)
    return { success: false, error: 'Network error. Please check your connection and try again.' }
  }
}

/**
 * Deactivate the current license
 */
export async function deactivateLicense(): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredLicense()

  if (!stored) {
    return { success: true }
  }

  try {
    await fetch(`${API_URL}/api/licenses/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: stored.key,
        deviceId: getDeviceId()
      })
    })
  } catch {
    // Continue anyway - allow offline deactivation
    console.log('[license] Could not reach server, deactivating locally')
  }

  clearLicense()
  return { success: true }
}

/**
 * Activate a license offline (for demo/testing purposes)
 * This simulates a successful activation without server
 */
export function activateLicenseOffline(
  licenseKey: string,
  email: string,
  type: LicenseType = 'individual',
  daysValid: number = 365
): { success: boolean } {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + daysValid)

  const licenseData: LicenseData = {
    key: licenseKey,
    type,
    email,
    expiresAt: expiresAt.toISOString(),
    perpetualVersion: getAppVersion(),
    activatedAt: new Date().toISOString(),
    lastValidated: new Date().toISOString()
  }

  saveLicense(licenseData)
  return { success: true }
}
