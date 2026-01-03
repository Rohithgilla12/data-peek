import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Loader2, FolderOpen, AlertTriangle, Download, CheckCircle2 } from 'lucide-react'
import { notify } from '@/stores/notification-store'
import { type Connection } from '@/stores'
import {
  type BackupOptions,
  type RestoreOptions,
  type BackupFormat,
  type VersionCompatibility,
  type ToolDownloadProgress
} from '@shared/index'

interface BackupRestoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection: Connection | null
}

export function BackupRestoreModal({ open, onOpenChange, connection }: BackupRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup')
  const [isProcessing, setIsProcessing] = useState(false)
  const [toolCheck, setToolCheck] = useState<{ available: boolean; error?: string } | null>(null)
  const [compatibility, setCompatibility] = useState<VersionCompatibility | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<ToolDownloadProgress | null>(null)

  // Backup State
  const [backupPath, setBackupPath] = useState('')
  const [backupFormat, setBackupFormat] = useState<BackupFormat>('custom')
  const [backupDataOnly, setBackupDataOnly] = useState(false)
  const [backupSchemaOnly, setBackupSchemaOnly] = useState(false)
  const [backupClean, setBackupClean] = useState(false)
  const [backupVerbose, setBackupVerbose] = useState(false)

  // Restore State
  const [restorePath, setRestorePath] = useState('')
  const [restoreFormat, setRestoreFormat] = useState<BackupFormat>('custom')
  const [restoreDataOnly, setRestoreDataOnly] = useState(false)
  const [restoreSchemaOnly, setRestoreSchemaOnly] = useState(false)
  const [restoreClean, setRestoreClean] = useState(true)
  const [restoreCreateDb, setRestoreCreateDb] = useState(false)
  const [restoreIfExists, setRestoreIfExists] = useState(true)

  useEffect(() => {
    if (open && connection) {
      checkCompatibility()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection])

  useEffect(() => {
    if (!open) return

    const unsubscribe = window.api.tools.onDownloadProgress((data) => {
      setDownloadProgress(data)
      if (data.phase === 'complete') {
        setIsDownloading(false)
        notify.success('PostgreSQL tools downloaded successfully!')
        checkCompatibility()
      } else if (data.phase === 'error') {
        setIsDownloading(false)
        notify.error('Download failed', data.error || 'Unknown error')
      }
    })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const checkCompatibility = async () => {
    if (!connection) return

    if (connection.dbType === 'postgresql') {
      try {
        const result = await window.api.tools.checkCompatibility(connection.id)
        if (result.success && result.data) {
          setCompatibility(result.data)
          const hasTools = Object.values(result.data.toolVersions).some((t) => t !== null)
          setToolCheck({
            available: hasTools && result.data.isCompatible,
            error: result.data.isCompatible
              ? undefined
              : result.data.mismatchDetails?.[0]?.recommendation
          })
        } else {
          await checkToolsFallback()
        }
      } catch {
        await checkToolsFallback()
      }
    } else {
      await checkToolsFallback()
    }
  }

  const checkToolsFallback = async () => {
    if (!connection) return
    try {
      const result = await window.api.backup.checkTools(connection.id)
      if (result.success && result.data) {
        setToolCheck(result.data)
      } else {
        setToolCheck({ available: false, error: result.error || 'Unknown error' })
      }
    } catch (error) {
      setToolCheck({ available: false, error: String(error) })
    }
  }

  const handleDownloadTools = async () => {
    if (!compatibility) return

    setIsDownloading(true)
    setDownloadProgress({ phase: 'downloading', progress: 0 })

    try {
      const result = await window.api.tools.downloadTools(compatibility.serverVersion.major)
      if (!result.success) {
        setIsDownloading(false)
        notify.error('Download failed', result.error || 'Unknown error')
      }
    } catch (error) {
      setIsDownloading(false)
      notify.error('Download failed', String(error))
    }
  }

  const handleBrowseBackupPath = async () => {
    try {
      const filters = [
        { name: 'PostgreSQL Custom Dump', extensions: ['dump', 'custom'] },
        { name: 'SQL', extensions: ['sql'] },
        { name: 'Tar', extensions: ['tar'] },
        { name: 'All Files', extensions: ['*'] }
      ]

      const path = await window.api.files.saveFilePicker({
        defaultPath: `backup_${connection?.database}_${new Date().toISOString().split('T')[0]}.dump`,
        filters
      })
      if (path) {
        setBackupPath(path)
        if (path.endsWith('.sql')) setBackupFormat('plain')
        else if (path.endsWith('.tar')) setBackupFormat('tar')
        else if (path.endsWith('.dump') || path.endsWith('.custom')) setBackupFormat('custom')
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleBrowseRestorePath = async () => {
    try {
      const path = await window.api.files.openFilePicker()
      if (path) {
        setRestorePath(path)
        if (path.endsWith('.sql')) setRestoreFormat('plain')
        else if (path.endsWith('.tar')) setRestoreFormat('tar')
        else if (path.endsWith('.dump') || path.endsWith('.custom')) setRestoreFormat('custom')
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleBackup = async () => {
    if (!connection || !backupPath) return

    setIsProcessing(true)
    try {
      const options: BackupOptions = {
        outputPath: backupPath,
        format: backupFormat,
        dataOnly: backupDataOnly,
        schemaOnly: backupSchemaOnly,
        clean: backupClean,
        verbose: backupVerbose
      }

      const result = await window.api.backup.startBackup(connection.id, options)

      if (result.success) {
        notify.success(`Backup completed successfully!`)
        onOpenChange(false)
      } else {
        notify.error(`Backup failed`, result.error || 'Unknown error')
      }
    } catch (error) {
      notify.error(`Backup failed`, String(error))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRestore = async () => {
    if (!connection || !restorePath) return

    if (!confirm('Are you sure you want to restore? This may overwrite existing data.')) {
      return
    }

    setIsProcessing(true)
    try {
      const options: RestoreOptions = {
        inputFile: restorePath,
        format: restoreFormat,
        dataOnly: restoreDataOnly,
        schemaOnly: restoreSchemaOnly,
        clean: restoreClean,
        createDb: restoreCreateDb,
        ifExists: restoreIfExists,
        exitOnError: true,
        verbose: true
      }

      const result = await window.api.backup.startRestore(connection.id, options)

      if (result.success) {
        notify.success(`Restore completed successfully!`)
        onOpenChange(false)
      } else {
        notify.error(`Restore failed`, result.error || 'Unknown error')
      }
    } catch (error) {
      notify.error(`Restore failed`, String(error))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Backup & Restore - {connection?.name}</DialogTitle>
          <DialogDescription>Manage database backups and perform restoration.</DialogDescription>
        </DialogHeader>

        {compatibility && connection?.dbType === 'postgresql' && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Server: PostgreSQL {compatibility.serverVersion.major}.
                {compatibility.serverVersion.minor}
              </span>
              {compatibility.toolVersions.pg_dump && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>
                    pg_dump: v{compatibility.toolVersions.pg_dump.version?.major}
                    {compatibility.toolVersions.pg_dump.source === 'managed' && (
                      <span className="text-xs ml-1 text-primary">(managed)</span>
                    )}
                  </span>
                </>
              )}
            </div>

            {compatibility.isCompatible && compatibility.toolVersions.pg_dump && (
              <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3 rounded-md flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4" />
                <span>Tools are compatible with the server version</span>
              </div>
            )}

            {!compatibility.isCompatible && compatibility.mismatchDetails && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-md">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      Tool Version Mismatch
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {compatibility.mismatchDetails.map((m) => (
                        <span key={m.tool}>
                          {m.tool} v{m.toolMajor} may not work correctly with PostgreSQL{' '}
                          {m.serverMajor}.{' '}
                        </span>
                      ))}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleDownloadTools}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          {downloadProgress?.phase === 'downloading' &&
                            `Downloading... ${Math.round(downloadProgress.progress)}%`}
                          {downloadProgress?.phase === 'extracting' && 'Extracting...'}
                          {downloadProgress?.phase === 'verifying' && 'Verifying...'}
                        </>
                      ) : (
                        <>
                          <Download className="size-4 mr-2" />
                          Download PostgreSQL {compatibility.serverVersion.major} Tools
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!compatibility.toolVersions.pg_dump && (
              <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-md">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">PostgreSQL Tools Not Found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      pg_dump, pg_restore, and psql are required for backup/restore operations.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleDownloadTools}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          {downloadProgress?.phase === 'downloading' &&
                            `Downloading... ${Math.round(downloadProgress.progress)}%`}
                          {downloadProgress?.phase === 'extracting' && 'Extracting...'}
                          {downloadProgress?.phase === 'verifying' && 'Verifying...'}
                        </>
                      ) : (
                        <>
                          <Download className="size-4 mr-2" />
                          Download PostgreSQL {compatibility.serverVersion.major} Tools
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {toolCheck && !toolCheck.available && !compatibility && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md flex items-center gap-2 text-sm mb-4">
            <AlertTriangle className="size-4" />
            <span>Required tools not found: {toolCheck.error}</span>
          </div>
        )}

        <div className="flex gap-2 border-b mb-4">
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'backup' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Backup
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'restore' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Restore
          </button>
        </div>

        <div className="space-y-4">
          {activeTab === 'backup' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Output File</Label>
                <div className="flex gap-2">
                  <Input
                    value={backupPath}
                    onChange={(e) => setBackupPath(e.target.value)}
                    placeholder="/path/to/backup.dump"
                  />
                  <Button variant="outline" size="icon" onClick={handleBrowseBackupPath}>
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={backupFormat}
                    onValueChange={(v) => setBackupFormat(v as BackupFormat)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom (Compressed)</SelectItem>
                      <SelectItem value="plain">Plain SQL</SelectItem>
                      <SelectItem value="tar">Tar</SelectItem>
                      <SelectItem value="directory">Directory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Options</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="backup-data"
                      checked={backupDataOnly}
                      disabled={backupSchemaOnly}
                      onCheckedChange={(c) => {
                        setBackupDataOnly(!!c)
                        if (c) setBackupSchemaOnly(false)
                      }}
                    />
                    <Label
                      htmlFor="backup-data"
                      className={`cursor-pointer ${backupSchemaOnly ? 'text-muted-foreground' : ''}`}
                    >
                      Data Only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="backup-schema"
                      checked={backupSchemaOnly}
                      disabled={backupDataOnly}
                      onCheckedChange={(c) => {
                        setBackupSchemaOnly(!!c)
                        if (c) setBackupDataOnly(false)
                      }}
                    />
                    <Label
                      htmlFor="backup-schema"
                      className={`cursor-pointer ${backupDataOnly ? 'text-muted-foreground' : ''}`}
                    >
                      Schema Only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="backup-clean"
                      checked={backupClean}
                      onCheckedChange={(c) => setBackupClean(!!c)}
                    />
                    <Label htmlFor="backup-clean" className="cursor-pointer">
                      Include DROP commands
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="backup-verbose"
                      checked={backupVerbose}
                      onCheckedChange={(c) => setBackupVerbose(!!c)}
                    />
                    <Label htmlFor="backup-verbose" className="cursor-pointer">
                      Verbose Output
                    </Label>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleBackup}
                disabled={isProcessing || !backupPath || (toolCheck ? !toolCheck.available : false)}
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Start Backup
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Input File</Label>
                <div className="flex gap-2">
                  <Input
                    value={restorePath}
                    onChange={(e) => setRestorePath(e.target.value)}
                    placeholder="/path/to/backup.dump"
                  />
                  <Button variant="outline" size="icon" onClick={handleBrowseRestorePath}>
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={restoreFormat}
                    onValueChange={(v) => setRestoreFormat(v as BackupFormat)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom (Compressed)</SelectItem>
                      <SelectItem value="plain">Plain SQL</SelectItem>
                      <SelectItem value="tar">Tar</SelectItem>
                      <SelectItem value="directory">Directory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Options</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="restore-clean"
                      checked={restoreClean}
                      onCheckedChange={(c) => setRestoreClean(!!c)}
                    />
                    <Label htmlFor="restore-clean" className="cursor-pointer">
                      Clean (Drop objects)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="restore-exists"
                      checked={restoreIfExists}
                      onCheckedChange={(c) => setRestoreIfExists(!!c)}
                    />
                    <Label htmlFor="restore-exists" className="cursor-pointer">
                      IF EXISTS (Safe Drop)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="restore-create"
                      checked={restoreCreateDb}
                      onCheckedChange={(c) => setRestoreCreateDb(!!c)}
                    />
                    <Label htmlFor="restore-create" className="cursor-pointer">
                      Create Database
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="restore-schema"
                      checked={restoreSchemaOnly}
                      disabled={restoreDataOnly}
                      onCheckedChange={(c) => {
                        setRestoreSchemaOnly(!!c)
                        if (c) setRestoreDataOnly(false)
                      }}
                    />
                    <Label
                      htmlFor="restore-schema"
                      className={`cursor-pointer ${restoreDataOnly ? 'text-muted-foreground' : ''}`}
                    >
                      Schema Only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="restore-data"
                      checked={restoreDataOnly}
                      disabled={restoreSchemaOnly}
                      onCheckedChange={(c) => {
                        setRestoreDataOnly(!!c)
                        if (c) setRestoreSchemaOnly(false)
                      }}
                    />
                    <Label
                      htmlFor="restore-data"
                      className={`cursor-pointer ${restoreSchemaOnly ? 'text-muted-foreground' : ''}`}
                    >
                      Data Only
                    </Label>
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={handleRestore}
                disabled={
                  isProcessing || !restorePath || (toolCheck ? !toolCheck.available : false)
                }
              >
                {isProcessing ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="size-4 mr-2" />
                )}
                Start Restore
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
