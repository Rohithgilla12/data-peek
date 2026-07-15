import { useState } from 'react'
import {
  copyExportToClipboard,
  downloadExport,
  maskExportData,
  type ExportData,
  type ExportDestination,
  type ExportFormat,
  type SQLExportOptions
} from '@/lib/export'
import { notify } from '@/stores'
import { useMaskingStore } from '@/stores/masking-store'
import type { Tab } from '@/stores/tab-store'

export interface PendingExport {
  format: ExportFormat
  destination: ExportDestination
  data: ExportData
  filename: string
}

/**
 * Result-set export for a tab: resolves the currently visible statement's data,
 * gates exports containing masked columns behind a confirmation, and performs
 * the clipboard/file export.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useResultExport(tabId: string, tab: Tab | undefined) {
  // Export with masked columns confirmation
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null)
  const getEffectiveMaskedColumns = useMaskingStore((s) => s.getEffectiveMaskedColumns)

  const buildMaskedExportData = (data: ExportData): ExportData => {
    const masked = getEffectiveMaskedColumns(
      tabId,
      data.columns.map((c) => c.name)
    )
    if (masked.size === 0) return data
    return maskExportData(data, masked)
  }

  // Export data for the currently visible result set. For multi-statement queries this
  // follows the active statement tab instead of always exporting the first result.
  const getCurrentExportData = (): ExportData | null => {
    if (!tab || !('result' in tab)) return null
    const idx = tab.activeResultIndex ?? 0
    const stmt = tab.multiResult?.statements?.[idx]
    if (stmt) {
      return {
        columns: stmt.fields.map((f) => ({ name: f.name, dataType: f.dataType })),
        rows: stmt.rows as Record<string, unknown>[]
      }
    }
    return tab.result ?? null
  }

  const getSQLExportOptions = (): SQLExportOptions => ({
    tableName: tab && tab.type === 'table-preview' ? tab.tableName : 'query_result',
    schemaName: tab && tab.type === 'table-preview' ? tab.schemaName : undefined
  })

  const doExport = async (
    format: ExportFormat,
    destination: ExportDestination,
    data: ExportData,
    filename: string
  ): Promise<void> => {
    const options = format === 'sql' ? getSQLExportOptions() : undefined

    try {
      if (destination === 'clipboard') {
        await copyExportToClipboard(data, format, options)
        notify.success(`Copied ${format.toUpperCase()} export to clipboard`)
      } else {
        downloadExport(data, format, filename, options)
      }
    } catch (error) {
      const action = destination === 'clipboard' ? 'Copy' : 'Export'
      notify.error(
        `${action} failed`,
        error instanceof Error ? error.message : 'An unexpected error occurred'
      )
    }
  }

  const handleExport = (
    format: ExportFormat,
    destination: ExportDestination,
    data: ExportData,
    filename: string
  ): void => {
    const masked = getEffectiveMaskedColumns(
      tabId,
      data.columns.map((c) => c.name)
    )
    if (masked.size > 0) {
      setPendingExport({ format, destination, data, filename })
      return
    }
    void doExport(format, destination, data, filename)
  }

  return {
    pendingExport,
    setPendingExport,
    buildMaskedExportData,
    getCurrentExportData,
    doExport,
    handleExport
  }
}
