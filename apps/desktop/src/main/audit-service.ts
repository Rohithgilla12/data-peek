import type { AuditEntryInput, AuditStatus } from '@shared/index'
import type { PersistentStore } from './storage'
import type { AuditStorage } from './audit-storage'
import { createLogger } from './lib/logger'

const log = createLogger('audit-service')

export interface AuditSettings {
  enabled: boolean
  retentionDays: number
}

export const AUDIT_SETTINGS_DEFAULTS: AuditSettings = { enabled: false, retentionDays: 90 }

type AuditStore = PersistentStore<{ auditSettings: AuditSettings }>

let store: AuditStore | null = null
let storage: AuditStorage | null = null
const warnedClasses = new Set<string>()
const DAY_MS = 24 * 60 * 60 * 1000
let pruneInterval: ReturnType<typeof setInterval> | null = null

function pruneNow(): void {
  if (!storage) return
  const s = settings()
  if (!s.enabled) return
  try {
    const removed = storage.prune(s.retentionDays)
    if (removed > 0) log.debug(`Pruned ${removed} audit entries older than retention`)
  } catch (err) {
    log.warn('Audit prune failed:', err)
  }
}

export function initAuditService(s: AuditStore, st: AuditStorage | null): void {
  store = s
  storage = st
  if (pruneInterval) {
    clearInterval(pruneInterval)
    pruneInterval = null
  }
  pruneNow()
  pruneInterval = setInterval(pruneNow, DAY_MS)
  pruneInterval.unref()
}

function settings(): AuditSettings {
  return store?.get('auditSettings', AUDIT_SETTINGS_DEFAULTS) ?? AUDIT_SETTINGS_DEFAULTS
}

export function recordAudit(entry: AuditEntryInput): void {
  if (!storage || !settings().enabled) return
  try {
    storage.record(entry)
  } catch (err) {
    const cls = err instanceof Error ? err.message.slice(0, 60) : String(err)
    if (!warnedClasses.has(cls)) {
      warnedClasses.add(cls)
      log.warn('Audit record failed (suppressing repeats):', cls)
    }
  }
}

export function getAuditStatus(): AuditStatus {
  const s = settings()
  let entryCount = 0
  try {
    entryCount = storage?.count({}) ?? 0
  } catch {
    // count failure should not break status
  }
  return {
    available: storage !== null,
    enabled: s.enabled,
    retentionDays: s.retentionDays,
    entryCount
  }
}

export function setAuditEnabled(enabled: boolean): AuditStatus {
  if (!store) throw new Error('Audit service not initialised')
  store.set('auditSettings', { ...settings(), enabled })
  return getAuditStatus()
}

export function setAuditRetention(days: number): AuditStatus {
  if (!store) throw new Error('Audit service not initialised')
  if (!Number.isInteger(days) || days < 7 || days > 3650) {
    throw new Error('Retention must be between 7 and 3650 days')
  }
  store.set('auditSettings', { ...settings(), retentionDays: days })
  if (storage && settings().enabled) {
    try {
      storage.prune(days)
    } catch (err) {
      log.warn('Audit prune failed:', err)
    }
  }
  return getAuditStatus()
}

export function getAuditStorage(): AuditStorage | null {
  return storage
}
