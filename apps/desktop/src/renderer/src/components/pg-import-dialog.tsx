import * as React from 'react'

import { Button, Label, Progress, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@data-peek/ui'
import { usePgDumpStore } from '@/stores/pg-dump-store'
import { useConnectionStore } from '@/stores'
import type { PgImportOnError } from '@shared/index'
import { Upload, Loader2, CheckCircle2, XCircle, X, AlertTriangle, ChevronDown } from 'lucide-react'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export function PgImportDialog() {
  const {
    importDialogOpen,
    setImportDialogOpen,
    importOptions,
    setImportOptions,
    importProgress,
    importResult,
    isImporting,
    importError,
    startImport,
    cancelImport,
    resetImport
  } = usePgDumpStore()

  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)
  const [errorsExpanded, setErrorsExpanded] = React.useState(false)

  const handleStartImport = async () => {
    const connection = getActiveConnection()
    if (!connection) return
    await startImport(connection)
  }

  const handleClose = () => {
    if (isImporting) return
    setImportDialogOpen(false)
    resetImport()
    setErrorsExpanded(false)
  }

  const progressPercent = importProgress
    ? importProgress.totalStatements > 0
      ? Math.round((importProgress.statementsExecuted / importProgress.totalStatements) * 100)
      : importProgress.phase === 'complete'
        ? 100
        : 0
    : 0

  const showResult = importResult || importError
  const showOptions = !isImporting && !showResult

  return (
    <Dialog open={importDialogOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            Import SQL File
          </DialogTitle>
          <DialogDescription>Import a .sql dump file into the connected database</DialogDescription>
        </DialogHeader>

        {showOptions && (
          <div className="space-y-4 py-2">
            {/* Error handling */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">On error</Label>
              <div className="flex gap-2">
                {(['abort', 'skip'] as PgImportOnError[]).map((mode) => (
                  <Button
                    key={mode}
                    variant={importOptions.onError === mode ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs flex-1"
                    onClick={() => setImportOptions({ onError: mode })}
                  >
                    {mode === 'abort' ? 'Abort on Error' : 'Skip & Continue'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Transaction wrapping */}
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={importOptions.useTransaction}
                onChange={(e) => setImportOptions({ useTransaction: e.target.checked })}
                className="rounded border-border"
              />
              Wrap entire import in a transaction
            </label>

            <p className="text-xs text-muted-foreground">
              A file picker will open to select the .sql file to import.
            </p>

            <Button
              onClick={handleStartImport}
              className="w-full"
              disabled={!getActiveConnection()}
            >
              <Upload className="size-4 mr-2" />
              Choose File & Import
            </Button>
          </div>
        )}

        {/* Progress */}
        {isImporting && importProgress && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {importProgress.phase === 'reading'
                    ? 'Reading file...'
                    : importProgress.phase === 'executing'
                      ? 'Executing statements...'
                      : importProgress.phase}
                </span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {importProgress.statementsExecuted.toLocaleString()} /{' '}
                {importProgress.totalStatements.toLocaleString()} statements
              </span>
              {importProgress.errorsEncountered > 0 && (
                <span className="text-destructive">{importProgress.errorsEncountered} errors</span>
              )}
            </div>

            {importProgress.currentStatement && (
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {importProgress.currentStatement}
              </p>
            )}

            <Button variant="outline" onClick={cancelImport} className="w-full" size="sm">
              <X className="size-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}

        {isImporting && !importProgress && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Result */}
        {importResult && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              {importResult.success && importResult.statementsFailed === 0 ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : importResult.success && importResult.statementsFailed > 0 ? (
                <AlertTriangle className="size-5 text-yellow-500" />
              ) : (
                <XCircle className="size-5 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {importResult.success && importResult.statementsFailed === 0
                  ? 'Import complete'
                  : importResult.success
                    ? 'Import complete with errors'
                    : 'Import failed'}
              </span>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{importResult.statementsExecuted.toLocaleString()} statements executed</p>
              {importResult.statementsSkipped > 0 && (
                <p className="text-yellow-500">
                  {importResult.statementsSkipped} statements skipped
                </p>
              )}
              {importResult.statementsFailed > 0 && (
                <p className="text-destructive">
                  {importResult.statementsFailed} statements failed
                </p>
              )}
              <p>{formatDuration(importResult.durationMs)}</p>
            </div>

            {/* Error details */}
            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs w-full justify-between"
                  onClick={() => setErrorsExpanded(!errorsExpanded)}
                >
                  <span>{importResult.errors.length} error(s)</span>
                  <ChevronDown
                    className={`size-3.5 transition-transform ${errorsExpanded ? 'rotate-180' : ''}`}
                  />
                </Button>

                {errorsExpanded && (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {importResult.errors.slice(0, 50).map((err, i) => (
                      <div key={i} className="p-2 bg-destructive/5 rounded text-xs space-y-1">
                        <p className="text-destructive font-medium">
                          Statement {err.statementIndex + 1}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground truncate">
                          {err.statement}
                        </p>
                        <p className="text-destructive">{err.error}</p>
                      </div>
                    ))}
                    {importResult.errors.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center">
                        ... and {importResult.errors.length - 50} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleClose} className="w-full" size="sm">
              Done
            </Button>
          </div>
        )}

        {/* Error (no result) */}
        {importError && !importResult && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <XCircle className="size-5 text-destructive" />
              <span className="text-sm font-medium">Import failed</span>
            </div>
            <p className="text-xs text-destructive">{importError}</p>
            <Button onClick={handleClose} className="w-full" size="sm">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
