import { ipcMain, dialog } from 'electron'
import type { AuditFilters, AuditSource } from '@shared/index'
import { wrapHandler } from './types'
import {
  getAuditStatus,
  setAuditEnabled,
  setAuditRetention,
  getAuditStorage
} from '../audit-service'

function requireStorage(): NonNullable<ReturnType<typeof getAuditStorage>> {
  const storage = getAuditStorage()
  if (!storage) throw new Error('Audit storage is unavailable on this system')
  return storage
}

export function registerAuditHandlers(): void {
  ipcMain.handle(
    'audit:status',
    wrapHandler(async () => getAuditStatus())
  )

  ipcMain.handle(
    'audit:setEnabled',
    wrapHandler(async (_e, { enabled }: { enabled: boolean }) => setAuditEnabled(enabled))
  )

  ipcMain.handle(
    'audit:setRetention',
    wrapHandler(async (_e, { days }: { days: number }) => setAuditRetention(days))
  )

  ipcMain.handle(
    'audit:list',
    wrapHandler(
      async (_e, args: AuditFilters & { limit: number; offset: number; source?: AuditSource }) => {
        const storage = requireStorage()
        const limit = Math.min(Math.max(1, args.limit ?? 100), 1000)
        return {
          entries: storage.list({ ...args, limit, offset: Math.max(0, args.offset ?? 0) }),
          total: storage.count(args)
        }
      }
    )
  )

  ipcMain.handle(
    'audit:verify',
    wrapHandler(async () => requireStorage().verify())
  )

  ipcMain.handle(
    'audit:export',
    wrapHandler(
      async (_e, { format, filters }: { format: 'csv' | 'json'; filters?: AuditFilters }) => {
        const storage = requireStorage()
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath: `data-peek-audit-${stamp}.${format}`,
          filters: [{ name: format.toUpperCase(), extensions: [format] }]
        })
        if (canceled || !filePath) return null
        const result = storage.exportTo(format, filePath, filters)
        return { path: filePath, entries: result.entries }
      }
    )
  )
}
