import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { usePgDumpStore } from '@/stores/pg-dump-store'
import { useConnectionStore } from '@/stores'
import type { PgExportMode, SchemaInfo } from '@shared/index'
import { Download, Loader2, CheckCircle2, XCircle, X } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

const PHASE_LABELS: Record<string, string> = {
  preparing: 'Preparing...',
  types: 'Exporting types...',
  sequences: 'Exporting sequences...',
  tables: 'Exporting tables...',
  data: 'Exporting data...',
  indexes: 'Creating indexes...',
  foreign_keys: 'Adding foreign keys...',
  views: 'Exporting views...',
  functions: 'Exporting functions...',
  complete: 'Complete',
  error: 'Error'
}

export function PgExportDialog() {
  const {
    exportDialogOpen,
    setExportDialogOpen,
    exportOptions,
    setExportOptions,
    exportProgress,
    exportResult,
    isExporting,
    exportError,
    startExport,
    cancelExport,
    resetExport
  } = usePgDumpStore()

  const schemas = useConnectionStore((s) => s.schemas)
  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)

  const handleStartExport = async () => {
    const connection = getActiveConnection()
    if (!connection) return
    await startExport(connection)
  }

  const handleClose = () => {
    if (isExporting) return
    setExportDialogOpen(false)
    resetExport()
  }

  const progressPercent = exportProgress
    ? exportProgress.totalObjects > 0
      ? Math.round((exportProgress.objectsProcessed / exportProgress.totalObjects) * 100)
      : exportProgress.phase === 'complete'
        ? 100
        : 0
    : 0

  const showResult = exportResult || exportError
  const showOptions = !isExporting && !showResult

  return (
    <Dialog open={exportDialogOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Export Database
          </DialogTitle>
          <DialogDescription>Export PostgreSQL database to a SQL file</DialogDescription>
        </DialogHeader>

        {showOptions && (
          <div className="space-y-4 py-2">
            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Export mode</Label>
              <div className="flex gap-2">
                {(['full', 'schema-only', 'data-only'] as PgExportMode[]).map((mode) => (
                  <Button
                    key={mode}
                    variant={exportOptions.mode === mode ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs flex-1"
                    onClick={() => setExportOptions({ mode })}
                  >
                    {mode === 'full'
                      ? 'Full'
                      : mode === 'schema-only'
                        ? 'Schema Only'
                        : 'Data Only'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Schema filter */}
            {schemas.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Schemas (empty = all)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {schemas.map((s: SchemaInfo) => {
                    const selected = exportOptions.schemas.includes(s.name)
                    return (
                      <Button
                        key={s.name}
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          const next = selected
                            ? exportOptions.schemas.filter((n) => n !== s.name)
                            : [...exportOptions.schemas, s.name]
                          setExportOptions({ schemas: next })
                        }}
                      >
                        {s.name}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Options checkboxes */}
            {exportOptions.mode !== 'data-only' && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Include</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'includeTypes', label: 'Types (ENUMs, etc.)' },
                    { key: 'includeSequences', label: 'Sequences' },
                    { key: 'includeFunctions', label: 'Functions' },
                    { key: 'includeViews', label: 'Views' }
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportOptions[key as keyof typeof exportOptions] as boolean}
                        onChange={(e) => setExportOptions({ [key]: e.target.checked })}
                        className="rounded border-border"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Batch size */}
            {exportOptions.mode !== 'schema-only' && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Rows per INSERT</Label>
                <div className="flex gap-2">
                  {[50, 100, 500, 1000].map((size) => (
                    <Button
                      key={size}
                      variant={exportOptions.dataBatchSize === size ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs flex-1"
                      onClick={() => setExportOptions({ dataBatchSize: size })}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Additional options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeDropStatements}
                  onChange={(e) => setExportOptions({ includeDropStatements: e.target.checked })}
                  className="rounded border-border"
                />
                Include DROP statements
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeTransaction}
                  onChange={(e) => setExportOptions({ includeTransaction: e.target.checked })}
                  className="rounded border-border"
                />
                Wrap in transaction
              </label>
            </div>

            <Button
              onClick={handleStartExport}
              className="w-full"
              disabled={!getActiveConnection()}
            >
              <Download className="size-4 mr-2" />
              Export Database
            </Button>
          </div>
        )}

        {/* Progress */}
        {isExporting && exportProgress && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {PHASE_LABELS[exportProgress.phase] ?? exportProgress.phase}
                </span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>

            {exportProgress.currentObject && (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {exportProgress.currentObject}
              </p>
            )}

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{exportProgress.rowsExported.toLocaleString()} rows</span>
              <span>{formatBytes(exportProgress.bytesWritten)}</span>
            </div>

            <Button variant="outline" onClick={cancelExport} className="w-full" size="sm">
              <X className="size-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}

        {isExporting && !exportProgress && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Result */}
        {exportResult && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              {exportResult.success ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : (
                <XCircle className="size-5 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {exportResult.success ? 'Export complete' : 'Export failed'}
              </span>
            </div>

            {exportResult.success && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{exportResult.tablesExported} tables exported</p>
                <p>{exportResult.rowsExported.toLocaleString()} rows exported</p>
                <p>{formatBytes(exportResult.bytesWritten)} written</p>
                <p>{formatDuration(exportResult.durationMs)}</p>
                <p className="font-mono text-[11px] break-all mt-2">{exportResult.filePath}</p>
              </div>
            )}

            {exportResult.error && <p className="text-xs text-destructive">{exportResult.error}</p>}

            <Button onClick={handleClose} className="w-full" size="sm">
              Done
            </Button>
          </div>
        )}

        {/* Error (no result) */}
        {exportError && !exportResult && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <XCircle className="size-5 text-destructive" />
              <span className="text-sm font-medium">Export failed</span>
            </div>
            <p className="text-xs text-destructive">{exportError}</p>
            <Button onClick={handleClose} className="w-full" size="sm">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
