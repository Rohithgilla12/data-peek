import { create } from 'zustand'
import type {
  CsvColumnMapping,
  CsvImportOptions,
  CsvImportProgress,
  CsvImportResult,
  ConnectionConfig
} from '@shared/index'

export interface ParsedCsvFile {
  headers: string[]
  rows: unknown[][]
  name: string
}

export interface ImportTableColumn {
  name: string
  dataType: string
  isNullable: boolean
}

interface ImportState {
  step: 1 | 2 | 3 | 4 | 5
  file: ParsedCsvFile | null
  targetSchema: string
  targetTable: string
  createNewTable: boolean
  columnMappings: CsvColumnMapping[]
  importOptions: CsvImportOptions
  progress: CsvImportProgress | null
  result: CsvImportResult | null
  isImporting: boolean
  error: string | null
  isOpen: boolean

  setOpen: (open: boolean) => void
  setStep: (step: 1 | 2 | 3 | 4 | 5) => void
  setFile: (file: ParsedCsvFile | null) => void
  setTargetTable: (schema: string, table: string) => void
  setCreateNewTable: (create: boolean) => void
  setMapping: (csvColumn: string, tableColumn: string | null) => void
  autoMapColumns: (tableColumns: string[]) => void
  setImportOptions: (options: Partial<CsvImportOptions>) => void
  setProgress: (progress: CsvImportProgress | null) => void
  setResult: (result: CsvImportResult | null) => void
  startImport: (config: ConnectionConfig) => Promise<void>
  cancelImport: () => Promise<void>
  reset: () => void
}

function inferColumnType(values: unknown[]): string {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 100)

  if (sample.length === 0) return 'text'

  const intRe = /^-?\d+$/
  const decimalRe = /^-?\d+\.\d+$/
  const isoBoolRe = /^(true|false)$/i
  const isoDateRe = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/

  let allInt = true
  let allDecimal = true
  let allBool = true
  let allDate = true

  for (const v of sample) {
    const str = String(v).trim()
    if (!intRe.test(str)) allInt = false
    if (!decimalRe.test(str) && !intRe.test(str)) allDecimal = false
    if (!isoBoolRe.test(str)) allBool = false
    if (!isoDateRe.test(str)) allDate = false
  }

  if (allBool) return 'boolean'
  if (allDate) return 'timestamp'
  if (allInt) return 'integer'
  if (allDecimal) return 'numeric'
  return 'text'
}

export function inferColumnTypes(
  headers: string[],
  rows: unknown[][]
): Array<{ name: string; dataType: string; isNullable: boolean }> {
  return headers.map((header, colIdx) => {
    const values = rows.map((row) => row[colIdx])
    const dataType = inferColumnType(values)
    const hasNulls = values.some((v) => v === null || v === undefined || v === '')
    return { name: header, dataType, isNullable: hasNulls }
  })
}

const DEFAULT_OPTIONS: CsvImportOptions = {
  batchSize: 500,
  onConflict: 'error',
  truncateFirst: false,
  useTransaction: true,
  useCopy: false
}

export const useImportStore = create<ImportState>((set, get) => ({
  step: 1,
  file: null,
  targetSchema: 'public',
  targetTable: '',
  createNewTable: false,
  columnMappings: [],
  importOptions: { ...DEFAULT_OPTIONS },
  progress: null,
  result: null,
  isImporting: false,
  error: null,
  isOpen: false,

  setOpen: (open) => set({ isOpen: open }),

  setStep: (step) => set({ step }),

  setFile: (file) => {
    set({ file, columnMappings: [] })
  },

  setTargetTable: (schema, table) => {
    set({ targetSchema: schema, targetTable: table })
  },

  setCreateNewTable: (create) => {
    set({ createNewTable: create })
  },

  setMapping: (csvColumn, tableColumn) => {
    const { columnMappings } = get()
    const existing = columnMappings.findIndex((m) => m.csvColumn === csvColumn)
    if (existing >= 0) {
      const updated = [...columnMappings]
      updated[existing] = { ...updated[existing], tableColumn }
      set({ columnMappings: updated })
    } else {
      set({ columnMappings: [...columnMappings, { csvColumn, tableColumn }] })
    }
  },

  autoMapColumns: (tableColumns) => {
    const { file } = get()
    if (!file) return

    const mappings: CsvColumnMapping[] = file.headers.map((header) => {
      const match = tableColumns.find(
        (col) => col.toLowerCase() === header.toLowerCase()
      )
      return { csvColumn: header, tableColumn: match ?? null }
    })
    set({ columnMappings: mappings })
  },

  setImportOptions: (options) => {
    set((state) => ({
      importOptions: { ...state.importOptions, ...options }
    }))
  },

  setProgress: (progress) => set({ progress }),

  setResult: (result) => set({ result }),

  startImport: async (config) => {
    const { file, targetSchema, targetTable, createNewTable, columnMappings, importOptions } = get()
    if (!file) return

    set({ isImporting: true, error: null, result: null, progress: null })

    const activeColumns = createNewTable
      ? inferColumnTypes(file.headers, file.rows)
      : undefined

    const mappingsToUse =
      columnMappings.length > 0
        ? columnMappings
        : file.headers.map((h) => ({ csvColumn: h, tableColumn: h }))

    const unsubscribe = window.api.db.onImportProgress((progress) => {
      set({ progress })
    })

    try {
      const request = {
        schema: targetSchema,
        table: targetTable,
        columns: file.headers,
        mappings: mappingsToUse,
        options: importOptions,
        createTable: createNewTable,
        ...(createNewTable && activeColumns ? { tableDefinition: { columns: activeColumns } } : {})
      }

      const response = await window.api.db.importCsv(config, request, file.rows)

      if (response.success && response.data) {
        set({ result: response.data, isImporting: false, step: 5 })
      } else {
        set({ error: response.error ?? 'Import failed', isImporting: false })
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unknown error',
        isImporting: false
      })
    } finally {
      unsubscribe()
    }
  },

  cancelImport: async () => {
    await window.api.db.cancelImport()
    set({ isImporting: false })
  },

  reset: () => {
    set({
      step: 1,
      file: null,
      targetSchema: 'public',
      targetTable: '',
      createNewTable: false,
      columnMappings: [],
      importOptions: { ...DEFAULT_OPTIONS },
      progress: null,
      result: null,
      isImporting: false,
      error: null
    })
  }
}))
