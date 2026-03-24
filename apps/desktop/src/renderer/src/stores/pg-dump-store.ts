import { create } from 'zustand'
import type {
  ConnectionConfig,
  PgExportOptions,
  PgExportProgress,
  PgExportResult,
  PgImportOptions,
  PgImportProgress,
  PgImportResult
} from '@shared/index'

const DEFAULT_EXPORT_OPTIONS: PgExportOptions = {
  mode: 'full',
  schemas: [],
  tables: [],
  excludeTables: [],
  includeTypes: true,
  includeSequences: true,
  includeFunctions: true,
  includeViews: true,
  dataBatchSize: 100,
  includeDropStatements: false,
  includeTransaction: true
}

const DEFAULT_IMPORT_OPTIONS: PgImportOptions = {
  onError: 'abort',
  useTransaction: false
}

interface PgDumpState {
  // Export
  exportDialogOpen: boolean
  exportOptions: PgExportOptions
  exportProgress: PgExportProgress | null
  exportResult: PgExportResult | null
  isExporting: boolean
  exportError: string | null

  // Import
  importDialogOpen: boolean
  importOptions: PgImportOptions
  importProgress: PgImportProgress | null
  importResult: PgImportResult | null
  isImporting: boolean
  importError: string | null

  // Export actions
  setExportDialogOpen: (open: boolean) => void
  setExportOptions: (options: Partial<PgExportOptions>) => void
  startExport: (config: ConnectionConfig) => Promise<void>
  cancelExport: () => Promise<void>

  // Import actions
  setImportDialogOpen: (open: boolean) => void
  setImportOptions: (options: Partial<PgImportOptions>) => void
  startImport: (config: ConnectionConfig) => Promise<void>
  cancelImport: () => Promise<void>

  // Reset
  resetExport: () => void
  resetImport: () => void
}

export const usePgDumpStore = create<PgDumpState>((set, get) => ({
  // Export state
  exportDialogOpen: false,
  exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
  exportProgress: null,
  exportResult: null,
  isExporting: false,
  exportError: null,

  // Import state
  importDialogOpen: false,
  importOptions: { ...DEFAULT_IMPORT_OPTIONS },
  importProgress: null,
  importResult: null,
  isImporting: false,
  importError: null,

  // Export actions
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),

  setExportOptions: (options) =>
    set((state) => ({
      exportOptions: { ...state.exportOptions, ...options }
    })),

  startExport: async (config) => {
    const { exportOptions } = get()
    set({ isExporting: true, exportError: null, exportResult: null, exportProgress: null })

    const unsubscribe = window.api.pgDump.onExportProgress((progress) => {
      set({ exportProgress: progress })
    })

    try {
      const response = await window.api.pgDump.export(config, exportOptions)
      if (response.success && response.data) {
        set({ exportResult: response.data, isExporting: false })
      } else {
        set({ exportError: response.error ?? 'Export failed', isExporting: false })
      }
    } catch (err) {
      set({
        exportError: err instanceof Error ? err.message : 'Unknown error',
        isExporting: false
      })
    } finally {
      unsubscribe()
    }
  },

  cancelExport: async () => {
    await window.api.pgDump.cancelExport()
    set({ isExporting: false })
  },

  // Import actions
  setImportDialogOpen: (open) => set({ importDialogOpen: open }),

  setImportOptions: (options) =>
    set((state) => ({
      importOptions: { ...state.importOptions, ...options }
    })),

  startImport: async (config) => {
    const { importOptions } = get()
    set({ isImporting: true, importError: null, importResult: null, importProgress: null })

    const unsubscribe = window.api.pgDump.onImportProgress((progress) => {
      set({ importProgress: progress })
    })

    try {
      const response = await window.api.pgDump.import(config, importOptions)
      if (response.success && response.data) {
        set({ importResult: response.data, isImporting: false })
      } else {
        set({ importError: response.error ?? 'Import failed', isImporting: false })
      }
    } catch (err) {
      set({
        importError: err instanceof Error ? err.message : 'Unknown error',
        isImporting: false
      })
    } finally {
      unsubscribe()
    }
  },

  cancelImport: async () => {
    await window.api.pgDump.cancelImport()
    set({ isImporting: false })
  },

  // Reset
  resetExport: () =>
    set({
      exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
      exportProgress: null,
      exportResult: null,
      isExporting: false,
      exportError: null
    }),

  resetImport: () =>
    set({
      importOptions: { ...DEFAULT_IMPORT_OPTIONS },
      importProgress: null,
      importResult: null,
      isImporting: false,
      importError: null
    })
}))
