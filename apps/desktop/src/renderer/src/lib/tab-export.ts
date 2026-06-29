import type { ExportData } from '@/lib/export'
import { isExecutableTab, type Tab } from '@/stores/tab-store'

export function getExportDataForTab(tab: Tab | null | undefined): ExportData | null {
  if (!tab || !isExecutableTab(tab)) return null

  if (tab.multiResult) {
    const statement = tab.multiResult.statements[tab.activeResultIndex ?? 0]
    if (!statement || !statement.isDataReturning) return null

    return {
      columns: statement.fields.map((field) => ({
        name: field.name,
        dataType: field.dataType
      })),
      rows: statement.rows
    }
  }

  return tab.result
}
