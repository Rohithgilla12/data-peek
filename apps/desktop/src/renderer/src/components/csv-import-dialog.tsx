import * as React from 'react'
import Papa from 'papaparse'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useImportStore, inferColumnTypes, type ParsedCsvFile } from '@/stores/import-store'
import { useConnectionStore } from '@/stores'

interface CsvImportDialogProps {
  defaultSchema?: string
  defaultTable?: string
}

const BATCH_SIZE_OPTIONS = [100, 500, 1000, 5000]

export function CsvImportDialog({ defaultSchema, defaultTable }: CsvImportDialogProps) {
  const {
    isOpen,
    setOpen,
    step,
    setStep,
    file,
    setFile,
    targetSchema,
    targetTable,
    setTargetTable,
    createNewTable,
    setCreateNewTable,
    columnMappings,
    setMapping,
    autoMapColumns,
    importOptions,
    setImportOptions,
    progress,
    result,
    isImporting,
    error,
    startImport,
    cancelImport,
    reset
  } = useImportStore()

  const schemas = useConnectionStore((s) => s.schemas)
  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [newTableName, setNewTableName] = React.useState('')

  React.useEffect(() => {
    if (isOpen && defaultSchema && defaultTable) {
      setTargetTable(defaultSchema, defaultTable)
    }
  }, [isOpen, defaultSchema, defaultTable, setTargetTable])

  const handleClose = () => {
    setOpen(false)
    reset()
  }

  const parseFile = (f: File) => {
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const rows = (results.data as Record<string, unknown>[]).map((row) =>
          headers.map((h) => row[h] ?? null)
        )
        const parsed: ParsedCsvFile = { headers, rows, name: f.name }
        setFile(parsed)
        setStep(2)
      },
      error: () => {
        setFile(null)
      }
    })
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) {
      parseFile(f)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) parseFile(f)
  }

  const currentTableColumns = React.useMemo(() => {
    if (createNewTable) return []
    const schema = schemas.find((s) => s.name === targetSchema)
    const table = schema?.tables.find((t) => t.name === targetTable)
    return table?.columns.map((c) => c.name) ?? []
  }, [schemas, targetSchema, targetTable, createNewTable])

  const inferredColumns = React.useMemo(() => {
    if (!file || !createNewTable) return []
    return inferColumnTypes(file.headers, file.rows)
  }, [file, createNewTable])

  const handleProceedToMapping = () => {
    if (!file) return
    if (createNewTable) {
      setTargetTable(targetSchema, newTableName || file.name.replace('.csv', ''))
      autoMapColumns(file.headers)
    } else {
      autoMapColumns(currentTableColumns)
    }
    setStep(3)
  }

  const handleStartImport = async () => {
    const connection = getActiveConnection()
    if (!connection) return
    setStep(5)
    await startImport(connection)
  }

  const progressPercent =
    progress && progress.totalRows > 0
      ? Math.round((progress.rowsImported / progress.totalRows) * 100)
      : 0

  const allSchemas = schemas.map((s) => s.name)
  const tablesForSchema = schemas.find((s) => s.name === targetSchema)?.tables ?? []

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Import CSV
          </SheetTitle>
          <SheetDescription>
            {step === 1 && 'Select a CSV file to import'}
            {step === 2 && 'Choose target table'}
            {step === 3 && 'Map CSV columns to table columns'}
            {step === 4 && 'Configure import options'}
            {step === 5 && 'Import progress'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 mt-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <ScrollArea className="flex-1 mt-4">
          {step === 1 && (
            <div className="space-y-4 pr-4">
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
              >
                <Upload className="size-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">or</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </div>
          )}

          {step === 2 && file && (
            <div className="space-y-4 pr-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {file.rows.length} rows
                </Badge>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">PREVIEW (first 10 rows)</Label>
                <div className="rounded-md border overflow-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {file.headers.map((h) => (
                          <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {file.rows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="text-xs max-w-[120px] truncate">
                              {cell === null || cell === undefined ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : String(cell)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="create-new-table"
                  checked={createNewTable}
                  onCheckedChange={setCreateNewTable}
                />
                <Label htmlFor="create-new-table" className="text-sm">Create new table</Label>
              </div>

              {createNewTable ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Schema</Label>
                      <Select value={targetSchema} onValueChange={(v) => setTargetTable(v, targetTable)}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allSchemas.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Table name</Label>
                      <Input
                        className="h-8 text-sm mt-1"
                        placeholder={file.name.replace('.csv', '')}
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">INFERRED COLUMNS</Label>
                    <div className="mt-1 rounded-md border overflow-auto max-h-36">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Column</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Nullable</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inferredColumns.map((col) => (
                            <TableRow key={col.name}>
                              <TableCell className="text-xs font-mono">{col.name}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className="text-[11px]">{col.dataType}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {col.isNullable ? 'Yes' : 'No'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Schema</Label>
                    <Select value={targetSchema} onValueChange={(v) => setTargetTable(v, '')}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allSchemas.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Table</Label>
                    <Select value={targetTable} onValueChange={(v) => setTargetTable(targetSchema, v)}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Select table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tablesForSchema
                          .filter((t) => t.type === 'table')
                          .map((t) => (
                            <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && file && (
            <div className="space-y-3 pr-4">
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                <span>CSV Column</span>
                <span>Table Column</span>
              </div>
              {file.headers.map((header) => {
                const mapping = columnMappings.find((m) => m.csvColumn === header)
                const tableCol = mapping?.tableColumn ?? null
                const columns = createNewTable ? file.headers : currentTableColumns
                const hasMatch = columns.includes(tableCol ?? '')
                const isUnmapped = tableCol === null

                return (
                  <div key={header} className="grid grid-cols-2 gap-2 items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono truncate">{header}</span>
                      {!isUnmapped && !hasMatch && !createNewTable && (
                        <AlertCircle className="size-3 text-yellow-500 shrink-0" />
                      )}
                    </div>
                    <Select
                      value={tableCol ?? '__none__'}
                      onValueChange={(v) => setMapping(header, v === '__none__' ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground italic">Skip</span>
                        </SelectItem>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 pr-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Batch Size</Label>
                <p className="text-xs text-muted-foreground">Rows inserted per database transaction</p>
                <div className="flex gap-2">
                  {BATCH_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      variant={importOptions.batchSize === size ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImportOptions({ batchSize: size })}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">On Conflict</Label>
                <p className="text-xs text-muted-foreground">What to do when a row already exists</p>
                <div className="flex gap-2">
                  {(['error', 'skip', 'update'] as const).map((opt) => (
                    <Button
                      key={opt}
                      variant={importOptions.onConflict === opt ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImportOptions({ onConflict: opt })}
                      className="capitalize"
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium" htmlFor="truncate-first">Truncate first</Label>
                  <p className="text-xs text-muted-foreground">Delete all existing rows before import</p>
                </div>
                <Switch
                  id="truncate-first"
                  checked={importOptions.truncateFirst}
                  onCheckedChange={(v) => setImportOptions({ truncateFirst: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium" htmlFor="use-transaction">Use transaction</Label>
                  <p className="text-xs text-muted-foreground">Rollback all changes if import fails</p>
                </div>
                <Switch
                  id="use-transaction"
                  checked={importOptions.useTransaction}
                  onCheckedChange={(v) => setImportOptions({ useTransaction: v })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">SQL PREVIEW (first 3 rows)</Label>
                {file && (
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-36 font-mono">
                    {(() => {
                      const mappedCols = columnMappings.filter((m) => m.tableColumn !== null)
                      if (mappedCols.length === 0 || !file) return 'No columns mapped'
                      const colNames = mappedCols.map((m) => m.tableColumn).join(', ')
                      const colIndexes = mappedCols.map((m) => file.headers.indexOf(m.csvColumn))
                      return file.rows.slice(0, 3).map((row, i) => {
                        const vals = colIndexes.map((idx) => {
                          const v = row[idx]
                          if (v === null || v === undefined || v === '') return 'NULL'
                          return `'${String(v).replace(/'/g, "''")}'`
                        }).join(', ')
                        return `-- row ${i + 1}\nINSERT INTO ${targetSchema}.${targetTable} (${colNames})\nVALUES (${vals});`
                      }).join('\n\n')
                    })()}
                  </pre>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 pr-4">
              {isImporting && progress && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span className="text-sm font-medium capitalize">{progress.phase}…</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.rowsImported.toLocaleString()} / {progress.totalRows.toLocaleString()} rows</span>
                    <span>Batch {progress.currentBatch} / {progress.totalBatches}</span>
                  </div>
                </div>
              )}

              {isImporting && !progress && (
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm">Preparing…</span>
                </div>
              )}

              {result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <XCircle className="size-5 text-destructive" />
                    )}
                    <span className="font-medium">
                      {result.success ? 'Import complete' : 'Import failed'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-muted p-3 text-center">
                      <p className="text-lg font-bold">{result.rowsImported.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Imported</p>
                    </div>
                    <div className="rounded-md bg-muted p-3 text-center">
                      <p className="text-lg font-bold">{result.rowsSkipped.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Skipped</p>
                    </div>
                    <div className="rounded-md bg-muted p-3 text-center">
                      <p className="text-lg font-bold">{result.rowsFailed.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Completed in {(result.durationMs / 1000).toFixed(2)}s
                  </p>
                  {result.error && (
                    <p className="text-xs text-destructive">{result.error}</p>
                  )}
                </div>
              )}

              {error && !result && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="size-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 pt-4 border-t mt-auto">
          {step > 1 && step < 5 && (
            <Button
              variant="outline"
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5)}
            >
              Back
            </Button>
          )}

          {step === 1 && (
            <Button variant="outline" className="ml-auto" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 2 && (
            <Button
              className="ml-auto"
              onClick={handleProceedToMapping}
              disabled={!createNewTable && !targetTable}
            >
              Next
            </Button>
          )}

          {step === 3 && (
            <Button
              className="ml-auto"
              onClick={() => setStep(4)}
              disabled={columnMappings.filter((m) => m.tableColumn !== null).length === 0}
            >
              Next
            </Button>
          )}

          {step === 4 && (
            <Button className="ml-auto" onClick={handleStartImport}>
              Start Import
            </Button>
          )}

          {step === 5 && isImporting && (
            <Button variant="destructive" className="ml-auto" onClick={cancelImport}>
              Cancel
            </Button>
          )}

          {step === 5 && !isImporting && (
            <>
              <Button variant="outline" onClick={() => { reset(); setOpen(true) }}>
                Import Another
              </Button>
              <Button className="ml-auto" onClick={handleClose}>
                Done
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
