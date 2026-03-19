import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand, featureColors } from '../../lib/colors'

const MockTableRow: React.FC<{
  cells: string[]
  delay: number
  blurIndex?: number
}> = ({ cells, delay, blurIndex }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entrance = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        opacity,
        display: 'flex',
        gap: 1,
        backgroundColor: brand.border,
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: brand.surface,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 16,
            color: brand.textSecondary,
            filter: blurIndex === i ? 'blur(8px)' : 'none',
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  )
}

export const ColumnStatsIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const barHeights = [65, 90, 45, 80, 55, 70, 95, 40, 60, 85]

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 14,
          color: brand.textMuted,
        }}
      >
        Column: revenue | min: 1.2k | max: 95k | avg: 42k
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          paddingTop: 16,
        }}
      >
        {barHeights.map((h, i) => {
          const barSpring = spring({
            frame: frame - i * 4,
            fps,
            config: { damping: 12, stiffness: 100 },
          })
          const height = interpolate(barSpring, [0, 1], [0, h * 3])

          return (
            <div
              key={i}
              style={{
                flex: 1,
                height,
                backgroundColor: featureColors.columnStats,
                borderRadius: '4px 4px 0 0',
                opacity: 0.8 + i * 0.02,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export const DataMaskingIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const blurAmount = interpolate(frame, [20, 50], [0, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const rows = [
    ['1', 'Alice Chen', 'alice@acme.co', 'admin'],
    ['2', 'Bob Park', 'bob@startup.io', 'user'],
    ['3', 'Carol Wu', 'carol@dev.org', 'editor'],
    ['4', 'Dan Liu', 'dan@corp.net', 'user'],
  ]

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 1,
          backgroundColor: brand.border,
        }}
      >
        {['id', 'name', 'email', 'role'].map((h) => (
          <div
            key={h}
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: brand.surfaceElevated,
              fontFamily: 'Geist Mono, monospace',
              fontSize: 14,
              fontWeight: 500,
              color: brand.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((cells, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 1,
            backgroundColor: brand.border,
          }}
        >
          {cells.map((cell, j) => (
            <div
              key={j}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: brand.surface,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 16,
                color: brand.textSecondary,
                filter: j === 2 ? `blur(${blurAmount}px)` : 'none',
              }}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
      {frame > 30 && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            padding: '4px 12px',
            borderRadius: 999,
            backgroundColor: `${featureColors.dataMasking}20`,
            border: `1px solid ${featureColors.dataMasking}40`,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: featureColors.dataMasking,
          }}
        >
          masked
        </div>
      )}
    </div>
  )
}

export const CsvImportIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const fileEntrance = spring({ frame, fps, config: { damping: 200 } })
  const fileDrop = interpolate(fileEntrance, [0, 1], [-80, 0])
  const fileOpacity = interpolate(fileEntrance, [0, 1], [0, 1])

  const progressWidth = interpolate(frame, [30, 80], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const checkScale = spring({
    frame: frame - 85,
    fps,
    config: { damping: 12 },
  })

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: 40,
      }}
    >
      <div
        style={{
          opacity: fileOpacity,
          transform: `translateY(${fileDrop}px)`,
          width: 80,
          height: 100,
          backgroundColor: brand.surfaceElevated,
          borderRadius: 12,
          border: `1px solid ${brand.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Geist Mono, monospace',
          fontSize: 14,
          color: featureColors.csvImport,
          fontWeight: 500,
        }}
      >
        .csv
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'Geist Mono, monospace',
            fontSize: 14,
            color: brand.textMuted,
          }}
        >
          <span>Importing users.csv</span>
          <span>{Math.round(progressWidth)}%</span>
        </div>
        <div
          style={{
            width: '100%',
            height: 8,
            backgroundColor: brand.border,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressWidth}%`,
              height: '100%',
              backgroundColor: featureColors.csvImport,
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      {frame > 85 && (
        <div
          style={{
            transform: `scale(${checkScale})`,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 18,
            color: featureColors.csvImport,
          }}
        >
          2,847 rows imported
        </div>
      )}
    </div>
  )
}

export const DataGeneratorIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const fakeRows = [
    ['Emma Wilson', 'emma.w@mail.com', 'Senior Dev'],
    ['James Chen', 'j.chen@corp.io', 'Designer'],
    ['Sofia Garcia', 'sofia.g@tech.co', 'PM'],
    ['Liam Park', 'liam.p@start.up', 'Engineer'],
    ['Ava Kim', 'ava.k@dev.org', 'Analyst'],
  ]

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: brand.surfaceElevated,
          borderBottom: `1px solid ${brand.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 14,
          color: featureColors.dataGenerator,
        }}
      >
        Generating 5,000 rows...
      </div>
      {fakeRows.map((cells, i) => {
        const rowEntrance = spring({
          frame: frame - 15 - i * 12,
          fps,
          config: { damping: 200 },
        })
        const rowOpacity = interpolate(rowEntrance, [0, 1], [0, 1])
        const rowTranslate = interpolate(rowEntrance, [0, 1], [20, 0])

        return (
          <div
            key={i}
            style={{
              opacity: rowOpacity,
              transform: `translateY(${rowTranslate}px)`,
              display: 'flex',
              gap: 1,
              backgroundColor: brand.border,
            }}
          >
            {cells.map((cell, j) => (
              <div
                key={j}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: brand.surface,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 16,
                  color: brand.textSecondary,
                }}
              >
                {cell}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export const PgNotificationsIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const notifications = [
    { channel: 'orders', payload: 'new_order: #4821', time: '0.3ms' },
    { channel: 'users', payload: 'signup: emma@dev.co', time: '0.1ms' },
    { channel: 'orders', payload: 'status: #4820 shipped', time: '0.2ms' },
    { channel: 'alerts', payload: 'high_cpu: db-primary', time: '0.4ms' },
  ]

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: brand.surfaceElevated,
          borderBottom: `1px solid ${brand.border}`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 14,
          color: brand.textMuted,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: featureColors.pgNotifications,
          }}
        />
        LISTEN *
      </div>
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.map((n, i) => {
          const entrance = spring({
            frame: frame - 20 - i * 18,
            fps,
            config: { damping: 15, stiffness: 120 },
          })
          const scale = interpolate(entrance, [0, 1], [0.9, 1])
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={i}
              style={{
                opacity,
                transform: `scale(${scale})`,
                padding: '10px 16px',
                backgroundColor: brand.surfaceElevated,
                borderRadius: 8,
                border: `1px solid ${brand.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 14,
              }}
            >
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: `${featureColors.pgNotifications}20`,
                  color: featureColors.pgNotifications,
                  fontSize: 12,
                }}
              >
                {n.channel}
              </span>
              <span style={{ color: brand.textSecondary, flex: 1 }}>
                {n.payload}
              </span>
              <span style={{ color: brand.textMuted, fontSize: 12 }}>
                {n.time}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const HealthMonitorIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const gaugeValue = interpolate(frame, [10, 60], [0, 97.2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const metrics = [
    { label: 'Active Queries', value: '12', color: featureColors.healthMonitor },
    { label: 'Cache Hit', value: `${gaugeValue.toFixed(1)}%`, color: '#10b981' },
    { label: 'Table Size', value: '2.4 GB', color: '#f59e0b' },
    { label: 'Locks', value: '0', color: '#22d3ee' },
  ]

  return (
    <div
      style={{
        width: 600,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 24,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}
    >
      {metrics.map((m, i) => {
        const entrance = spring({
          frame: frame - i * 8,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const scale = interpolate(entrance, [0, 1], [0.95, 1])

        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `scale(${scale})`,
              backgroundColor: brand.surfaceElevated,
              borderRadius: 12,
              border: `1px solid ${brand.border}`,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 13,
                color: brand.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 36,
                fontWeight: 700,
                color: m.color,
              }}
            >
              {m.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}
