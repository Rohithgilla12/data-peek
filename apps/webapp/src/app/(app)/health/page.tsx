'use client'

import { useState } from 'react'
import { Activity, Database, Gauge, Lock, RefreshCw } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { ProGate } from '@/components/upgrade/pro-gate'

export default function HealthPage() {
  const { activeConnectionId } = useConnectionStore()
  const [refreshInterval, setRefreshInterval] = useState(10000)

  const queryOpts = { connectionId: activeConnectionId! }
  const enabled = !!activeConnectionId

  const { data: activeQueries, refetch: refetchQueries } = trpc.health.activeQueries.useQuery(
    queryOpts,
    { enabled, refetchInterval: refreshInterval }
  )
  const { data: tableSizes } = trpc.health.tableSizes.useQuery(queryOpts, {
    enabled,
    refetchInterval: refreshInterval * 3,
  })
  const { data: cacheStats } = trpc.health.cacheStats.useQuery(queryOpts, {
    enabled,
    refetchInterval: refreshInterval * 3,
  })
  const { data: locks } = trpc.health.locks.useQuery(queryOpts, {
    enabled,
    refetchInterval: refreshInterval,
  })

  if (!activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a connection to view health metrics
      </div>
    )
  }

  const ratioColor = (ratio: number) =>
    ratio >= 99 ? 'text-success' : ratio >= 95 ? 'text-yellow-400' : 'text-destructive'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Health Monitor</h1>
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground"
          >
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
          </select>
          <button
            onClick={() => refetchQueries()}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-medium">Active Queries</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {activeQueries?.length ?? 0}
            </span>
          </div>
          {activeQueries?.length === 0 && (
            <p className="text-xs text-success">No active queries</p>
          )}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {activeQueries?.map((q) => (
              <div key={q.pid} className="rounded bg-muted/30 p-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    PID {q.pid} &middot; {q.user}
                  </span>
                  <span
                    className={
                      q.durationMs > 60000 ? 'text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {q.duration}
                  </span>
                </div>
                <pre className="mt-1 text-foreground/80 truncate font-mono">{q.query}</pre>
              </div>
            ))}
          </div>
        </div>

        <ProGate feature="Table Sizes">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-medium">Table Sizes</h2>
              <span className="ml-auto text-xs text-muted-foreground">{tableSizes?.dbSize}</span>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {tableSizes?.tables.slice(0, 20).map((t) => (
                <div
                  key={`${t.schema}.${t.table}`}
                  className="flex items-center gap-2 text-xs py-0.5"
                >
                  <span className="text-foreground truncate flex-1">
                    {t.schema}.{t.table}
                  </span>
                  <span className="text-muted-foreground">{t.rows.toLocaleString()} rows</span>
                  <span className="text-accent font-mono">{t.totalSize}</span>
                </div>
              ))}
            </div>
          </div>
        </ProGate>

        <ProGate feature="Cache Hit Ratios">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-medium">Cache Hit Ratios</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div
                  className={`text-2xl font-bold ${ratioColor(cacheStats?.bufferHitRatio ?? 0)}`}
                >
                  {cacheStats?.bufferHitRatio ?? 0}%
                </div>
                <div className="text-xs text-muted-foreground">Buffer Cache</div>
              </div>
              <div className="text-center">
                <div
                  className={`text-2xl font-bold ${ratioColor(cacheStats?.indexHitRatio ?? 0)}`}
                >
                  {cacheStats?.indexHitRatio ?? 0}%
                </div>
                <div className="text-xs text-muted-foreground">Index Cache</div>
              </div>
            </div>
          </div>
        </ProGate>

        <ProGate feature="Locks & Blocking">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-medium">Locks & Blocking</h2>
              <span className="ml-auto text-xs text-muted-foreground">{locks?.length ?? 0}</span>
            </div>
            {locks?.length === 0 && <p className="text-xs text-success">No blocking locks</p>}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {locks?.map((l, i) => (
                <div key={i} className="rounded bg-muted/30 p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-destructive">
                      PID {l.blockedPid} blocked by {l.blockingPid}
                    </span>
                    <span
                      className={
                        l.waitDurationMs > 30000 ? 'text-destructive' : 'text-muted-foreground'
                      }
                    >
                      {l.waitDuration}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {l.lockType} on {l.relation || 'unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ProGate>
      </div>
    </div>
  )
}
