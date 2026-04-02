import { useEffect, useState } from 'react'
import { Activity, RefreshCw, Loader2, Skull, CheckCircle2 } from 'lucide-react'
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
              {isLoading.activeQueries && <Loader2 className="size-3 animate-spin" />}
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
              {isLoading.cacheStats && <Loader2 className="size-3 animate-spin" />}
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
              {isLoading.locks && <Loader2 className="size-3 animate-spin" />}
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
    </div>
  )
}
