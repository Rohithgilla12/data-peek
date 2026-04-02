import type { ReactNode } from 'react'
import type { ShareImageTheme } from '@/components/share-image-dialog'
import type {
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo
} from '@shared/index'
import { cn } from '@/lib/utils'

function themeColors(theme: ShareImageTheme) {
  return {
    text: theme === 'light' ? 'text-zinc-800' : 'text-zinc-100',
    muted: theme === 'light' ? 'text-zinc-500' : 'text-zinc-400',
    header: theme === 'light' ? 'text-zinc-700' : 'text-zinc-300',
    border: theme === 'light' ? 'border-zinc-200' : 'border-zinc-700',
    barBg: theme === 'light' ? 'bg-zinc-200' : 'bg-zinc-700',
    barFill: theme === 'light' ? 'bg-blue-500' : 'bg-blue-400'
  }
}

function cacheColor(ratio: number, theme: ShareImageTheme) {
  if (ratio >= 99) return theme === 'light' ? 'text-green-600' : 'text-green-400'
  if (ratio >= 95) return theme === 'light' ? 'text-yellow-600' : 'text-yellow-400'
  return theme === 'light' ? 'text-red-600' : 'text-red-400'
}

function ConnectionLabel({ label, className }: { label: string; className: string }) {
  if (!label) return null
  return <p className={className}>{label}</p>
}

interface ShareHeaderProps {
  title: string
  connLabel: string
  theme: ShareImageTheme
  extra?: ReactNode
}

function ShareHeader({ title, connLabel, theme, extra }: ShareHeaderProps) {
  const c = themeColors(theme)
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className={cn('text-sm font-semibold', c.text)}>{title}</p>
        {extra}
      </div>
      <ConnectionLabel label={connLabel} className={cn('text-xs', c.muted)} />
    </div>
  )
}

export function ShareActiveQueries({
  theme,
  activeQueries,
  connLabel
}: {
  theme: ShareImageTheme
  activeQueries: ActiveQuery[]
  connLabel: string
}) {
  const c = themeColors(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Active Queries" connLabel={connLabel} theme={theme} />
      {activeQueries.length === 0 ? (
        <p className={cn('py-4 text-center text-xs', c.muted)}>No active queries</p>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>PID</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>User</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>State</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Duration</th>
              <th className={cn('py-1.5 text-left font-medium', c.header)}>Query</th>
            </tr>
          </thead>
          <tbody>
            {activeQueries.map((q) => (
              <tr key={q.pid} className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
                <td className={cn('py-1.5 pr-3', c.text)}>{q.pid}</td>
                <td className={cn('py-1.5 pr-3', c.text)}>{q.user}</td>
                <td className={cn('py-1.5 pr-3', c.text)}>{q.state}</td>
                <td
                  className={cn(
                    'py-1.5 pr-3',
                    q.durationMs > 60000
                      ? theme === 'light'
                        ? 'font-medium text-red-600'
                        : 'font-medium text-red-400'
                      : c.text
                  )}
                >
                  {q.duration}
                </td>
                <td className={cn('py-1.5 font-mono', c.text)}>{q.query.slice(0, 80)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function ShareTableSizes({
  theme,
  sortedTableSizes,
  maxTotalSize,
  dbSize,
  connLabel
}: {
  theme: ShareImageTheme
  sortedTableSizes: TableSizeInfo[]
  maxTotalSize: number
  dbSize: DatabaseSizeInfo | null
  connLabel: string
}) {
  const c = themeColors(theme)
  return (
    <div className="space-y-3">
      <ShareHeader
        title="Table Sizes"
        connLabel={connLabel}
        theme={theme}
        extra={dbSize && <p className={cn('text-xs', c.muted)}>DB Total: {dbSize.totalSize}</p>}
      />
      {sortedTableSizes.length === 0 ? (
        <p className={cn('py-4 text-center text-xs', c.muted)}>No tables found</p>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Table</th>
              <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Est. Rows</th>
              <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Data</th>
              <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Index</th>
              <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Total</th>
              <th className={cn('w-24 py-1.5 font-medium', c.header)} />
            </tr>
          </thead>
          <tbody>
            {sortedTableSizes.slice(0, 30).map((t) => (
              <tr
                key={`${t.schema}.${t.table}`}
                className={cn(c.border)}
                style={{ borderBottom: '1px solid' }}
              >
                <td className={cn('py-1.5 pr-3', c.text)}>
                  <span className={c.muted}>{t.schema}.</span>
                  {t.table}
                </td>
                <td className={cn('py-1.5 pr-3 text-right', c.text)}>
                  {t.rowCountEstimate.toLocaleString()}
                </td>
                <td className={cn('py-1.5 pr-3 text-right', c.text)}>{t.dataSize}</td>
                <td className={cn('py-1.5 pr-3 text-right', c.text)}>{t.indexSize}</td>
                <td className={cn('py-1.5 pr-3 text-right font-medium', c.text)}>{t.totalSize}</td>
                <td className="w-24 py-1.5">
                  <div className={cn('h-2 w-full rounded-full', c.barBg)}>
                    <div
                      className={cn('h-2 rounded-full', c.barFill)}
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
}

export function ShareCacheStats({
  theme,
  cacheStats,
  connLabel
}: {
  theme: ShareImageTheme
  cacheStats: CacheStats | null
  connLabel: string
}) {
  const c = themeColors(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Cache Hit Ratios" connLabel={connLabel} theme={theme} />
      {!cacheStats ? (
        <p className={cn('py-4 text-center text-xs', c.muted)}>No data</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div
              className={cn('rounded-lg border p-4 text-center', c.border)}
              style={{ borderWidth: '1px' }}
            >
              <p className={cn('text-xs', c.muted)}>Buffer Cache</p>
              <p
                className={cn(
                  'text-3xl font-bold',
                  cacheColor(cacheStats.bufferCacheHitRatio, theme)
                )}
              >
                {cacheStats.bufferCacheHitRatio}%
              </p>
            </div>
            <div
              className={cn('rounded-lg border p-4 text-center', c.border)}
              style={{ borderWidth: '1px' }}
            >
              <p className={cn('text-xs', c.muted)}>Index Cache</p>
              <p className={cn('text-3xl font-bold', cacheColor(cacheStats.indexHitRatio, theme))}>
                {cacheStats.indexHitRatio}%
              </p>
            </div>
          </div>
          {cacheStats.tableCacheDetails && cacheStats.tableCacheDetails.length > 0 && (
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
                  <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Table</th>
                  <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Hit %</th>
                  <th className={cn('py-1.5 pr-3 text-right font-medium', c.header)}>Seq Scans</th>
                  <th className={cn('py-1.5 text-right font-medium', c.header)}>Idx Scans</th>
                </tr>
              </thead>
              <tbody>
                {cacheStats.tableCacheDetails.slice(0, 15).map((t) => (
                  <tr key={t.table} className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
                    <td className={cn('py-1.5 pr-3', c.text)}>{t.table}</td>
                    <td className={cn('py-1.5 pr-3 text-right', cacheColor(t.hitRatio, theme))}>
                      {t.hitRatio}%
                    </td>
                    <td className={cn('py-1.5 pr-3 text-right', c.text)}>
                      {t.seqScans.toLocaleString()}
                    </td>
                    <td className={cn('py-1.5 text-right', c.text)}>
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
}

export function ShareLocks({
  theme,
  locks,
  connLabel
}: {
  theme: ShareImageTheme
  locks: LockInfo[]
  connLabel: string
}) {
  const c = themeColors(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Locks &amp; Blocking" connLabel={connLabel} theme={theme} />
      {locks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <p className={cn('text-sm', theme === 'light' ? 'text-green-600' : 'text-green-400')}>
            No blocking locks
          </p>
        </div>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className={cn(c.border)} style={{ borderBottom: '1px solid' }}>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Blocked</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Blocker</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Type</th>
              <th className={cn('py-1.5 pr-3 text-left font-medium', c.header)}>Relation</th>
              <th className={cn('py-1.5 text-left font-medium', c.header)}>Wait</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((l, i) => (
              <tr
                key={`${l.blockedPid}-${l.blockingPid}-${i}`}
                className={cn(c.border)}
                style={{ borderBottom: '1px solid' }}
              >
                <td className={cn('py-1.5 pr-3', c.text)}>
                  <span className="font-medium">{l.blockedPid}</span>
                  <span className={c.muted}> ({l.blockedUser})</span>
                </td>
                <td className={cn('py-1.5 pr-3', c.text)}>
                  <span className="font-medium">{l.blockingPid}</span>
                  <span className={c.muted}> ({l.blockingUser})</span>
                </td>
                <td className={cn('py-1.5 pr-3', c.text)}>{l.lockType}</td>
                <td className={cn('py-1.5 pr-3', c.text)}>{l.relation || '-'}</td>
                <td
                  className={cn(
                    'py-1.5',
                    l.waitDurationMs > 30000
                      ? theme === 'light'
                        ? 'font-medium text-red-600'
                        : 'font-medium text-red-400'
                      : c.text
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
}
