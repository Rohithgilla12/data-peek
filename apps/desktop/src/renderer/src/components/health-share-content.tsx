import type { CSSProperties, ReactNode } from 'react'
import type { ShareImageTheme } from '@/components/share-image-dialog'
import type {
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo
} from '@shared/index'

function themeStyles(theme: ShareImageTheme) {
  const light = theme === 'light'
  return {
    text: { color: light ? 'oklch(0.2 0 0)' : 'oklch(0.9 0 0)' } as CSSProperties,
    muted: { color: light ? 'oklch(0.5 0.02 250)' : 'oklch(0.6 0.02 250)' } as CSSProperties,
    header: { color: light ? 'oklch(0.35 0.03 250)' : 'oklch(0.75 0.03 250)' } as CSSProperties,
    border: {
      borderColor: light ? 'oklch(0.88 0.01 250)' : 'oklch(0.3 0.02 250)'
    } as CSSProperties,
    barBg: light ? 'oklch(0.9 0.01 250)' : 'oklch(0.3 0.02 250)',
    barFill: light ? 'oklch(0.55 0.15 250)' : 'oklch(0.65 0.15 250)'
  }
}

function cacheColor(ratio: number, theme: ShareImageTheme): CSSProperties {
  const light = theme === 'light'
  if (ratio >= 99) return { color: light ? 'oklch(0.45 0.17 150)' : 'oklch(0.7 0.17 150)' }
  if (ratio >= 95) return { color: light ? 'oklch(0.5 0.15 85)' : 'oklch(0.75 0.15 85)' }
  return { color: light ? 'oklch(0.5 0.2 25)' : 'oklch(0.7 0.2 25)' }
}

function durationWarning(theme: ShareImageTheme): CSSProperties {
  return { color: theme === 'light' ? 'oklch(0.5 0.2 25)' : 'oklch(0.7 0.2 25)' }
}

function successColor(theme: ShareImageTheme): CSSProperties {
  return { color: theme === 'light' ? 'oklch(0.45 0.17 150)' : 'oklch(0.7 0.17 150)' }
}

function ConnectionLabel({ label, style }: { label: string; style: CSSProperties }) {
  if (!label) return null
  return (
    <p className="text-xs" style={style}>
      {label}
    </p>
  )
}

interface ShareHeaderProps {
  title: string
  connLabel: string
  theme: ShareImageTheme
  extra?: ReactNode
}

function ShareHeader({ title, connLabel, theme, extra }: ShareHeaderProps) {
  const c = themeStyles(theme)
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold" style={c.text}>
          {title}
        </p>
        {extra}
      </div>
      <ConnectionLabel label={connLabel} style={c.muted} />
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
  const c = themeStyles(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Active Queries" connLabel={connLabel} theme={theme} />
      {activeQueries.length === 0 ? (
        <p className="py-4 text-center text-xs" style={c.muted}>
          No active queries
        </p>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid', ...c.border }}>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                PID
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                User
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                State
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Duration
              </th>
              <th className="py-1.5 text-left font-medium" style={c.header}>
                Query
              </th>
            </tr>
          </thead>
          <tbody>
            {activeQueries.map((q) => (
              <tr key={q.pid} style={{ borderBottom: '1px solid', ...c.border }}>
                <td className="py-1.5 pr-3" style={c.text}>
                  {q.pid}
                </td>
                <td className="py-1.5 pr-3" style={c.text}>
                  {q.user}
                </td>
                <td className="py-1.5 pr-3" style={c.text}>
                  {q.state}
                </td>
                <td
                  className={q.durationMs > 60000 ? 'py-1.5 pr-3 font-medium' : 'py-1.5 pr-3'}
                  style={q.durationMs > 60000 ? durationWarning(theme) : c.text}
                >
                  {q.duration}
                </td>
                <td className="py-1.5 font-mono" style={c.text}>
                  {q.query.slice(0, 80)}
                </td>
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
  const c = themeStyles(theme)
  return (
    <div className="space-y-3">
      <ShareHeader
        title="Table Sizes"
        connLabel={connLabel}
        theme={theme}
        extra={
          dbSize && (
            <p className="text-xs" style={c.muted}>
              DB Total: {dbSize.totalSize}
            </p>
          )
        }
      />
      {sortedTableSizes.length === 0 ? (
        <p className="py-4 text-center text-xs" style={c.muted}>
          No tables found
        </p>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid', ...c.border }}>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Table
              </th>
              <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                Est. Rows
              </th>
              <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                Data
              </th>
              <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                Index
              </th>
              <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                Total
              </th>
              <th className="w-24 py-1.5 font-medium" style={c.header} />
            </tr>
          </thead>
          <tbody>
            {sortedTableSizes.slice(0, 30).map((t) => (
              <tr key={`${t.schema}.${t.table}`} style={{ borderBottom: '1px solid', ...c.border }}>
                <td className="py-1.5 pr-3" style={c.text}>
                  <span style={c.muted}>{t.schema}.</span>
                  {t.table}
                </td>
                <td className="py-1.5 pr-3 text-right" style={c.text}>
                  {t.rowCountEstimate.toLocaleString()}
                </td>
                <td className="py-1.5 pr-3 text-right" style={c.text}>
                  {t.dataSize}
                </td>
                <td className="py-1.5 pr-3 text-right" style={c.text}>
                  {t.indexSize}
                </td>
                <td className="py-1.5 pr-3 text-right font-medium" style={c.text}>
                  {t.totalSize}
                </td>
                <td className="w-24 py-1.5">
                  <div className="h-2 w-full rounded-full" style={{ backgroundColor: c.barBg }}>
                    <div
                      className="h-2 rounded-full"
                      style={{
                        backgroundColor: c.barFill,
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
  const c = themeStyles(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Cache Hit Ratios" connLabel={connLabel} theme={theme} />
      {!cacheStats ? (
        <p className="py-4 text-center text-xs" style={c.muted}>
          No data
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{ borderWidth: '1px', borderStyle: 'solid', ...c.border }}
            >
              <p className="text-xs" style={c.muted}>
                Buffer Cache
              </p>
              <p
                className="text-3xl font-bold"
                style={cacheColor(cacheStats.bufferCacheHitRatio, theme)}
              >
                {cacheStats.bufferCacheHitRatio}%
              </p>
            </div>
            <div
              className="rounded-lg p-4 text-center"
              style={{ borderWidth: '1px', borderStyle: 'solid', ...c.border }}
            >
              <p className="text-xs" style={c.muted}>
                Index Cache
              </p>
              <p className="text-3xl font-bold" style={cacheColor(cacheStats.indexHitRatio, theme)}>
                {cacheStats.indexHitRatio}%
              </p>
            </div>
          </div>
          {cacheStats.tableCacheDetails && cacheStats.tableCacheDetails.length > 0 && (
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid', ...c.border }}>
                  <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                    Table
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                    Hit %
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium" style={c.header}>
                    Seq Scans
                  </th>
                  <th className="py-1.5 text-right font-medium" style={c.header}>
                    Idx Scans
                  </th>
                </tr>
              </thead>
              <tbody>
                {cacheStats.tableCacheDetails.slice(0, 15).map((t) => (
                  <tr key={t.table} style={{ borderBottom: '1px solid', ...c.border }}>
                    <td className="py-1.5 pr-3" style={c.text}>
                      {t.table}
                    </td>
                    <td className="py-1.5 pr-3 text-right" style={cacheColor(t.hitRatio, theme)}>
                      {t.hitRatio}%
                    </td>
                    <td className="py-1.5 pr-3 text-right" style={c.text}>
                      {t.seqScans.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right" style={c.text}>
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
  const c = themeStyles(theme)
  return (
    <div className="space-y-3">
      <ShareHeader title="Locks &amp; Blocking" connLabel={connLabel} theme={theme} />
      {locks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <p className="text-sm" style={successColor(theme)}>
            No blocking locks
          </p>
        </div>
      ) : (
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid', ...c.border }}>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Blocked
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Blocker
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Type
              </th>
              <th className="py-1.5 pr-3 text-left font-medium" style={c.header}>
                Relation
              </th>
              <th className="py-1.5 text-left font-medium" style={c.header}>
                Wait
              </th>
            </tr>
          </thead>
          <tbody>
            {locks.map((l, i) => (
              <tr
                key={`${l.blockedPid}-${l.blockingPid}-${i}`}
                style={{ borderBottom: '1px solid', ...c.border }}
              >
                <td className="py-1.5 pr-3" style={c.text}>
                  <span className="font-medium">{l.blockedPid}</span>
                  <span style={c.muted}> ({l.blockedUser})</span>
                </td>
                <td className="py-1.5 pr-3" style={c.text}>
                  <span className="font-medium">{l.blockingPid}</span>
                  <span style={c.muted}> ({l.blockingUser})</span>
                </td>
                <td className="py-1.5 pr-3" style={c.text}>
                  {l.lockType}
                </td>
                <td className="py-1.5 pr-3" style={c.text}>
                  {l.relation || '-'}
                </td>
                <td
                  className={l.waitDurationMs > 30000 ? 'py-1.5 font-medium' : 'py-1.5'}
                  style={l.waitDurationMs > 30000 ? durationWarning(theme) : c.text}
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
