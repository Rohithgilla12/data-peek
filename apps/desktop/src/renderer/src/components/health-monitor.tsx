import { useEffect, useState, type ReactNode } from 'react'
import { Activity, RefreshCw, Loader2, Skull, CheckCircle2, Share2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShareImageDialog, type ShareImageTheme } from '@/components/share-image-dialog'
import { useConnectionStore } from '@/stores/connection-store'
import { useHealthStore } from '@/stores/health-store'
import { useTabStore } from '@/stores/tab-store'
import { cn } from '@/lib/utils'

interface HealthMonitorProps {
  tabId: string
}

const REFRESH_OPTIONS = [
  { label: '2s', value: '2000' },
  { label: '5s', value: '5000' },
  { label: '10s', value: '10000' },
  { label: '30s', value: '30000' },
  { label: 'Off', value: '0' }
]

export function HealthMonitor({ tabId }: HealthMonitorProps) {
  const tab = useTabStore((s) => s.getTab(tabId))
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === tab?.connectionId)

  const activeQueries = useHealthStore((s) => s.activeQueries)
  const tableSizes = useHealthStore((s) => s.tableSizes)
  const dbSize = useHealthStore((s) => s.dbSize)
  const cacheStats = useHealthStore((s) => s.cacheStats)
  const locks = useHealthStore((s) => s.locks)
  const refreshInterval = useHealthStore((s) => s.refreshInterval)
  const isLoading = useHealthStore((s) => s.isLoading)
  const errors = useHealthStore((s) => s.errors)
  const setRefreshInterval = useHealthStore((s) => s.setRefreshInterval)
  const startPolling = useHealthStore((s) => s.startPolling)
  const stopPolling = useHealthStore((s) => s.stopPolling)
  const fetchAll = useHealthStore((s) => s.fetchAll)
  const killQuery = useHealthStore((s) => s.killQuery)

  const [sizeSort, setSizeSort] = useState<'total' | 'data' | 'index' | 'rows'>('total')
  const [shareCard, setShareCard] = useState<
    'activeQueries' | 'tableSizes' | 'cacheStats' | 'locks' | null
  >(null)

  useEffect(() => {
    if (!connection) return
    startPolling(connection)
    return () => {
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, refreshInterval])

  const handleRefreshIntervalChange = (value: string) => {
    const ms = Number(value)
    setRefreshInterval(ms)
  }

  const handleManualRefresh = () => {
    if (!connection) return
    fetchAll(connection)
  }

  const handleKillQuery = async (pid: number) => {
    if (!connection) return
    await killQuery(connection, pid)
    await useHealthStore.getState().fetchActiveQueries(connection)
  }

  const handleKillBlocker = async (pid: number) => {
    if (!connection) return
    await killQuery(connection, pid)
    await useHealthStore.getState().fetchLocks(connection)
  }

  const sortedTableSizes = [...tableSizes].sort((a, b) => {
    switch (sizeSort) {
      case 'data':
        return b.dataSizeBytes - a.dataSizeBytes
      case 'index':
        return b.indexSizeBytes - a.indexSizeBytes
      case 'rows':
        return b.rowCountEstimate - a.rowCountEstimate
      default:
        return b.totalSizeBytes - a.totalSizeBytes
    }
  })

  const maxTotalSize = sortedTableSizes.length > 0 ? sortedTableSizes[0].totalSizeBytes : 0

  if (!connection) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No connection selected
      </div>
    )
  }

  const cacheColor = (ratio: number) => {
    if (ratio >= 99) return 'text-green-500'
    if (ratio >= 95) return 'text-yellow-500'
    return 'text-red-500'
  }

  const shareCacheColor = (ratio: number, theme: ShareImageTheme) => {
    if (ratio >= 99) return theme === 'light' ? 'text-green-600' : 'text-green-400'
    if (ratio >= 95) return theme === 'light' ? 'text-yellow-600' : 'text-yellow-400'
    return theme === 'light' ? 'text-red-600' : 'text-red-400'
  }

  const shareButton = (card: typeof shareCard) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShareCard(card)}
          >
            <Share2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Share as image</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  const renderShareContent = (theme: ShareImageTheme): ReactNode => {
    const textColor = theme === 'light' ? 'text-zinc-800' : 'text-zinc-100'
    const mutedColor = theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'
    const headerColor = theme === 'light' ? 'text-zinc-700' : 'text-zinc-300'
    const borderColor = theme === 'light' ? 'border-zinc-200' : 'border-zinc-700'
    const barBg = theme === 'light' ? 'bg-zinc-200' : 'bg-zinc-700'
    const barFill = theme === 'light' ? 'bg-blue-500' : 'bg-blue-400'

    const connLabel = connection?.name || connection?.host || ''

    switch (shareCard) {
      case 'activeQueries':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={cn('text-sm font-semibold', textColor)}>Active Queries</p>
              {connLabel && <p className={cn('text-xs', mutedColor)}>{connLabel}</p>}
            </div>
            {activeQueries.length === 0 ? (
              <p className={cn('py-4 text-center text-xs', mutedColor)}>No active queries</p>
            ) : (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className={cn(borderColor)} style={{ borderBottom: '1px solid' }}>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>PID</th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>User</th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>State</th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>
                      Duration
                    </th>
                    <th className={cn('py-1.5 text-left font-medium', headerColor)}>Query</th>
                  </tr>
                </thead>
                <tbody>
                  {activeQueries.map((q) => (
                    <tr
                      key={q.pid}
                      className={cn(borderColor)}
                      style={{ borderBottom: '1px solid' }}
                    >
                      <td className={cn('py-1.5 pr-3', textColor)}>{q.pid}</td>
                      <td className={cn('py-1.5 pr-3', textColor)}>{q.user}</td>
                      <td className={cn('py-1.5 pr-3', textColor)}>{q.state}</td>
                      <td
                        className={cn(
                          'py-1.5 pr-3',
                          q.durationMs > 60000
                            ? theme === 'light'
                              ? 'font-medium text-red-600'
                              : 'font-medium text-red-400'
                            : textColor
                        )}
                      >
                        {q.duration}
                      </td>
                      <td className={cn('py-1.5 font-mono', textColor)}>{q.query.slice(0, 80)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )

      case 'tableSizes':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className={cn('text-sm font-semibold', textColor)}>Table Sizes</p>
                {dbSize && (
                  <p className={cn('text-xs', mutedColor)}>DB Total: {dbSize.totalSize}</p>
                )}
              </div>
              {connLabel && <p className={cn('text-xs', mutedColor)}>{connLabel}</p>}
            </div>
            {sortedTableSizes.length === 0 ? (
              <p className={cn('py-4 text-center text-xs', mutedColor)}>No tables found</p>
            ) : (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className={cn(borderColor)} style={{ borderBottom: '1px solid' }}>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>Table</th>
                    <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>
                      Est. Rows
                    </th>
                    <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>Data</th>
                    <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>Index</th>
                    <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>Total</th>
                    <th className={cn('w-24 py-1.5 font-medium', headerColor)} />
                  </tr>
                </thead>
                <tbody>
                  {sortedTableSizes.slice(0, 30).map((t) => (
                    <tr
                      key={`${t.schema}.${t.table}`}
                      className={cn(borderColor)}
                      style={{ borderBottom: '1px solid' }}
                    >
                      <td className={cn('py-1.5 pr-3', textColor)}>
                        <span className={mutedColor}>{t.schema}.</span>
                        {t.table}
                      </td>
                      <td className={cn('py-1.5 pr-3 text-right', textColor)}>
                        {t.rowCountEstimate.toLocaleString()}
                      </td>
                      <td className={cn('py-1.5 pr-3 text-right', textColor)}>{t.dataSize}</td>
                      <td className={cn('py-1.5 pr-3 text-right', textColor)}>{t.indexSize}</td>
                      <td className={cn('py-1.5 pr-3 text-right font-medium', textColor)}>
                        {t.totalSize}
                      </td>
                      <td className="w-24 py-1.5">
                        <div className={cn('h-2 w-full rounded-full', barBg)}>
                          <div
                            className={cn('h-2 rounded-full', barFill)}
                            style={{
                              width: `${maxTotalSize > 0 ? (t.totalSizeBytes / maxTotalSize) * 100 : 0}%`
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )

      case 'cacheStats':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={cn('text-sm font-semibold', textColor)}>Cache Hit Ratios</p>
              {connLabel && <p className={cn('text-xs', mutedColor)}>{connLabel}</p>}
            </div>
            {!cacheStats ? (
              <p className={cn('py-4 text-center text-xs', mutedColor)}>No data</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className={cn('rounded-lg border p-4 text-center', borderColor)}
                    style={{ borderWidth: '1px' }}
                  >
                    <p className={cn('text-xs', mutedColor)}>Buffer Cache</p>
                    <p
                      className={cn(
                        'text-3xl font-bold',
                        shareCacheColor(cacheStats.bufferCacheHitRatio, theme)
                      )}
                    >
                      {cacheStats.bufferCacheHitRatio}%
                    </p>
                  </div>
                  <div
                    className={cn('rounded-lg border p-4 text-center', borderColor)}
                    style={{ borderWidth: '1px' }}
                  >
                    <p className={cn('text-xs', mutedColor)}>Index Cache</p>
                    <p
                      className={cn(
                        'text-3xl font-bold',
                        shareCacheColor(cacheStats.indexHitRatio, theme)
                      )}
                    >
                      {cacheStats.indexHitRatio}%
                    </p>
                  </div>
                </div>
                {cacheStats.tableCacheDetails && cacheStats.tableCacheDetails.length > 0 && (
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className={cn(borderColor)} style={{ borderBottom: '1px solid' }}>
                        <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>
                          Table
                        </th>
                        <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>
                          Hit %
                        </th>
                        <th className={cn('py-1.5 pr-3 text-right font-medium', headerColor)}>
                          Seq Scans
                        </th>
                        <th className={cn('py-1.5 text-right font-medium', headerColor)}>
                          Idx Scans
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cacheStats.tableCacheDetails.slice(0, 15).map((t) => (
                        <tr
                          key={t.table}
                          className={cn(borderColor)}
                          style={{ borderBottom: '1px solid' }}
                        >
                          <td className={cn('py-1.5 pr-3', textColor)}>{t.table}</td>
                          <td
                            className={cn(
                              'py-1.5 pr-3 text-right',
                              shareCacheColor(t.hitRatio, theme)
                            )}
                          >
                            {t.hitRatio}%
                          </td>
                          <td className={cn('py-1.5 pr-3 text-right', textColor)}>
                            {t.seqScans.toLocaleString()}
                          </td>
                          <td className={cn('py-1.5 text-right', textColor)}>
                            {t.indexScans.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )

      case 'locks':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={cn('text-sm font-semibold', textColor)}>Locks &amp; Blocking</p>
              {connLabel && <p className={cn('text-xs', mutedColor)}>{connLabel}</p>}
            </div>
            {locks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6">
                <p
                  className={cn('text-sm', theme === 'light' ? 'text-green-600' : 'text-green-400')}
                >
                  No blocking locks
                </p>
              </div>
            ) : (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className={cn(borderColor)} style={{ borderBottom: '1px solid' }}>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>
                      Blocked
                    </th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>
                      Blocker
                    </th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>Type</th>
                    <th className={cn('py-1.5 pr-3 text-left font-medium', headerColor)}>
                      Relation
                    </th>
                    <th className={cn('py-1.5 text-left font-medium', headerColor)}>Wait</th>
                  </tr>
                </thead>
                <tbody>
                  {locks.map((l, i) => (
                    <tr
                      key={`${l.blockedPid}-${l.blockingPid}-${i}`}
                      className={cn(borderColor)}
                      style={{ borderBottom: '1px solid' }}
                    >
                      <td className={cn('py-1.5 pr-3', textColor)}>
                        <span className="font-medium">{l.blockedPid}</span>
                        <span className={mutedColor}> ({l.blockedUser})</span>
                      </td>
                      <td className={cn('py-1.5 pr-3', textColor)}>
                        <span className="font-medium">{l.blockingPid}</span>
                        <span className={mutedColor}> ({l.blockingUser})</span>
                      </td>
                      <td className={cn('py-1.5 pr-3', textColor)}>{l.lockType}</td>
                      <td className={cn('py-1.5 pr-3', textColor)}>{l.relation || '-'}</td>
                      <td
                        className={cn(
                          'py-1.5',
                          l.waitDurationMs > 30000
                            ? theme === 'light'
                              ? 'font-medium text-red-600'
                              : 'font-medium text-red-400'
                            : textColor
                        )}
                      >
                        {l.waitDuration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )

      default:
        return null
    }
  }

  const shareDialogTitles: Record<string, string> = {
    activeQueries: 'Share Active Queries',
    tableSizes: 'Share Table Sizes',
    cacheStats: 'Share Cache Hit Ratios',
    locks: 'Share Locks & Blocking'
  }

  const shareDialogPrefixes: Record<string, string> = {
    activeQueries: 'active-queries',
    tableSizes: 'table-sizes',
    cacheStats: 'cache-stats',
    locks: 'locks'
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{connection.name || connection.host}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Refresh:</span>
          <Select value={String(refreshInterval)} onValueChange={handleRefreshIntervalChange}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleManualRefresh}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-auto p-3">
        {/* Active Queries */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Active Queries
              <div className="flex items-center gap-1">
                {isLoading.activeQueries && <Loader2 className="size-3 animate-spin" />}
                {shareButton('activeQueries')}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0 px-3 pb-3">
            {errors.activeQueries ? (
              <p className="text-xs text-destructive">{errors.activeQueries}</p>
            ) : activeQueries.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No active queries</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-xs">PID</TableHead>
                    <TableHead className="w-20 text-xs">User</TableHead>
                    <TableHead className="w-20 text-xs">State</TableHead>
                    <TableHead className="w-20 text-xs">Duration</TableHead>
                    <TableHead className="text-xs">Query</TableHead>
                    <TableHead className="w-14 text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeQueries.map((q) => (
                    <TableRow key={q.pid}>
                      <TableCell className="text-xs">{q.pid}</TableCell>
                      <TableCell className="text-xs">{q.user}</TableCell>
                      <TableCell className="text-xs">{q.state}</TableCell>
                      <TableCell
                        className={cn(
                          'text-xs',
                          q.durationMs > 60000 && 'font-medium text-red-500'
                        )}
                      >
                        {q.duration}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs font-mono">
                        {q.query.slice(0, 100)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Skull className="size-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Kill Query?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Cancel the query running on PID {q.pid} (user: {q.user})? This will
                                attempt to cancel the current statement.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleKillQuery(q.pid)}>
                                Kill Query
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Table Sizes */}
        <Card className="flex max-h-[500px] flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                Table Sizes
                {dbSize && (
                  <span className="text-xs font-normal text-muted-foreground">
                    DB Total: {dbSize.totalSize}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isLoading.tableSizes && <Loader2 className="size-3 animate-spin" />}
                {shareButton('tableSizes')}
                <Select value={sizeSort} onValueChange={(v) => setSizeSort(v as typeof sizeSort)}>
                  <SelectTrigger className="h-6 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="data">Data</SelectItem>
                    <SelectItem value="index">Index</SelectItem>
                    <SelectItem value="rows">Rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0 px-3 pb-3">
            {errors.tableSizes ? (
              <p className="text-xs text-destructive">{errors.tableSizes}</p>
            ) : sortedTableSizes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No tables found</p>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">Table</TableHead>
                    <TableHead className="w-20 text-right text-xs">Est. Rows</TableHead>
                    <TableHead className="w-20 text-right text-xs">Data</TableHead>
                    <TableHead className="w-20 text-right text-xs">Index</TableHead>
                    <TableHead className="w-20 text-right text-xs">Total</TableHead>
                    <TableHead className="w-24 text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTableSizes.slice(0, 50).map((t) => (
                    <TableRow key={`${t.schema}.${t.table}`}>
                      <TableCell className="text-xs">
                        <span className="text-muted-foreground">{t.schema}.</span>
                        {t.table}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {t.rowCountEstimate.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs">{t.dataSize}</TableCell>
                      <TableCell className="text-right text-xs">{t.indexSize}</TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {t.totalSize}
                      </TableCell>
                      <TableCell>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary/60"
                            style={{
                              width: `${maxTotalSize > 0 ? (t.totalSizeBytes / maxTotalSize) * 100 : 0}%`
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Cache Hit Ratios */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Cache Hit Ratios
              <div className="flex items-center gap-1">
                {isLoading.cacheStats && <Loader2 className="size-3 animate-spin" />}
                {shareButton('cacheStats')}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto px-3 pb-3">
            {errors.cacheStats ? (
              <p className="text-xs text-destructive">{errors.cacheStats}</p>
            ) : !cacheStats ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 text-center">
                    <p className="text-xs text-muted-foreground">Buffer Cache</p>
                    <p
                      className={cn(
                        'text-3xl font-bold',
                        cacheColor(cacheStats.bufferCacheHitRatio)
                      )}
                    >
                      {cacheStats.bufferCacheHitRatio}%
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <p className="text-xs text-muted-foreground">Index Cache</p>
                    <p className={cn('text-3xl font-bold', cacheColor(cacheStats.indexHitRatio))}>
                      {cacheStats.indexHitRatio}%
                    </p>
                  </div>
                </div>
                {cacheStats.tableCacheDetails && cacheStats.tableCacheDetails.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Table</TableHead>
                        <TableHead className="w-16 text-right text-xs">Hit %</TableHead>
                        <TableHead className="w-20 text-right text-xs">Seq Scans</TableHead>
                        <TableHead className="w-20 text-right text-xs">Idx Scans</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cacheStats.tableCacheDetails.slice(0, 15).map((t) => (
                        <TableRow key={t.table}>
                          <TableCell className="text-xs">{t.table}</TableCell>
                          <TableCell className={cn('text-right text-xs', cacheColor(t.hitRatio))}>
                            {t.hitRatio}%
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {t.seqScans.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {t.indexScans.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Locks & Blocking */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Locks &amp; Blocking
              <div className="flex items-center gap-1">
                {isLoading.locks && <Loader2 className="size-3 animate-spin" />}
                {shareButton('locks')}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0 px-3 pb-3">
            {errors.locks ? (
              <p className="text-xs text-destructive">{errors.locks}</p>
            ) : locks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <CheckCircle2 className="size-6 text-green-500" />
                <p className="text-sm text-green-600">No blocking locks</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20 text-xs">Blocked</TableHead>
                    <TableHead className="w-20 text-xs">Blocker</TableHead>
                    <TableHead className="w-20 text-xs">Type</TableHead>
                    <TableHead className="text-xs">Relation</TableHead>
                    <TableHead className="w-16 text-xs">Wait</TableHead>
                    <TableHead className="w-14 text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locks.map((l, i) => (
                    <TableRow key={`${l.blockedPid}-${l.blockingPid}-${i}`}>
                      <TableCell className="text-xs">
                        <span className="font-medium">{l.blockedPid}</span>
                        <span className="text-muted-foreground"> ({l.blockedUser})</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{l.blockingPid}</span>
                        <span className="text-muted-foreground"> ({l.blockingUser})</span>
                      </TableCell>
                      <TableCell className="text-xs">{l.lockType}</TableCell>
                      <TableCell className="text-xs">{l.relation || '-'}</TableCell>
                      <TableCell
                        className={cn(
                          'text-xs',
                          l.waitDurationMs > 30000 && 'font-medium text-red-500'
                        )}
                      >
                        {l.waitDuration}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Skull className="size-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Kill Blocker?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Cancel the blocking query on PID {l.blockingPid} (user:{' '}
                                {l.blockingUser})? This will unblock PID {l.blockedPid}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleKillBlocker(l.blockingPid)}>
                                Kill Blocker
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Share Image Dialog */}
      <ShareImageDialog
        open={!!shareCard}
        onOpenChange={(open) => !open && setShareCard(null)}
        title={shareCard ? shareDialogTitles[shareCard] : ''}
        description="Generate a shareable image of this health dashboard panel"
        filenamePrefix={shareCard ? shareDialogPrefixes[shareCard] : 'health'}
      >
        {renderShareContent}
      </ShareImageDialog>
    </div>
  )
}
