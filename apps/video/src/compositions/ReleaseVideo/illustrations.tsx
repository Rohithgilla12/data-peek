import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'

export const IdentifierQuotingIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const databases = [
    { name: 'PostgreSQL', quote: '"', color: '#3b82f6' },
    { name: 'MySQL', quote: '`', color: '#f59e0b' },
    { name: 'MSSQL', quote: '[', color: '#ef4444' },
  ]

  const tableName = 'UserAccounts'
  const strikeOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const checkOpacity = interpolate(frame, [65, 75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        Cross-database quoting
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          backgroundColor: `${brand.border}40`,
          borderRadius: 8,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 15,
          position: 'relative',
        }}
      >
        <span style={{ color: '#ef4444', opacity: strikeOpacity }}>
          ✕
        </span>
        <span
          style={{
            color: brand.textSecondary,
            textDecoration:
              strikeOpacity > 0.5 ? 'line-through' : 'none',
            opacity: strikeOpacity > 0.5 ? 0.4 : 0.8,
          }}
        >
          SELECT * FROM {tableName}
        </span>
      </div>

      {databases.map((db, i) => {
        const entrance = spring({
          frame: frame - 20 - i * 14,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateX = interpolate(entrance, [0, 1], [30, 0])

        const closeQuote = db.quote === '[' ? ']' : db.quote

        return (
          <div
            key={db.name}
            style={{
              opacity,
              transform: `translateX(${translateX}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
            }}
          >
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                backgroundColor: `${db.color}20`,
                color: db.color,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {db.name}
            </span>
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 15,
                color: brand.textSecondary,
              }}
            >
              SELECT * FROM{' '}
              <span style={{ color: db.color }}>
                {db.quote}{tableName}{closeQuote}
              </span>
            </span>
            <span
              style={{
                marginLeft: 'auto',
                color: '#10b981',
                opacity: checkOpacity,
                fontSize: 16,
              }}
            >
              ✓
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const EnumParsingIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const rawEntrance = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
  })
  const rawOpacity = interpolate(rawEntrance, [0, 1], [0, 1])

  const arrowEntrance = spring({
    frame: frame - 40,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const arrowScale = interpolate(arrowEntrance, [0, 1], [0, 1])

  const parsedEntrance = spring({
    frame: frame - 55,
    fps,
    config: { damping: 200 },
  })
  const parsedOpacity = interpolate(parsedEntrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Enum array fix
      </div>

      <div
        style={{
          opacity: rawOpacity,
          padding: '16px 20px',
          backgroundColor: '#ef444415',
          borderRadius: 10,
          border: '1px solid #ef444440',
          fontFamily: 'Geist Mono, monospace',
          fontSize: 15,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span style={{ color: brand.textMuted, fontSize: 12 }}>
          pg driver returns:
        </span>
        <span style={{ color: '#ef4444' }}>
          {`"{active,inactive,pending}"`}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          transform: `scale(${arrowScale})`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          color: brand.accent,
        }}
      >
        ↓
      </div>

      <div
        style={{
          opacity: parsedOpacity,
          padding: '16px 20px',
          backgroundColor: '#10b98115',
          borderRadius: 10,
          border: '1px solid #10b98140',
          fontFamily: 'Geist Mono, monospace',
          fontSize: 15,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span style={{ color: brand.textMuted, fontSize: 12 }}>
          now correctly parsed:
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['active', 'inactive', 'pending'].map((val, i) => {
            const chipEntrance = spring({
              frame: frame - 60 - i * 6,
              fps,
              config: { damping: 12, stiffness: 120 },
            })
            const chipScale = interpolate(chipEntrance, [0, 1], [0.8, 1])
            const chipOpacity = interpolate(chipEntrance, [0, 1], [0, 1])

            return (
              <span
                key={val}
                style={{
                  opacity: chipOpacity,
                  transform: `scale(${chipScale})`,
                  padding: '4px 12px',
                  borderRadius: 6,
                  backgroundColor: '#8b5cf620',
                  color: '#8b5cf6',
                  fontSize: 14,
                }}
              >
                {val}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const StabilityIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const items = [
    { label: 'crypto.randomUUID()', status: 'Fixed', icon: '→ import { randomUUID }' },
    { label: 'brew install', status: 'Fixed', icon: '→ brew install --cask' },
    { label: 'Image assets', status: 'Optimized', icon: '→ -82% file size' },
    { label: 'Error boundaries', status: 'Added', icon: '→ graceful recovery' },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        Stability improvements
      </div>

      {items.map((item, i) => {
        const entrance = spring({
          frame: frame - 10 - i * 12,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateY = interpolate(entrance, [0, 1], [16, 0])

        const checkEntrance = spring({
          frame: frame - 30 - i * 12,
          fps,
          config: { damping: 12, stiffness: 100 },
        })
        const checkScale = interpolate(checkEntrance, [0, 1], [0, 1])

        return (
          <div
            key={item.label}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              padding: '14px 18px',
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            <span
              style={{
                transform: `scale(${checkScale})`,
                color: '#10b981',
                fontSize: 18,
                width: 24,
                textAlign: 'center',
              }}
            >
              ✓
            </span>
            <span
              style={{
                fontSize: 15,
                color: brand.textPrimary,
                fontWeight: 500,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 13,
                color: brand.textMuted,
              }}
            >
              {item.icon}
            </span>
          </div>
        )
      })}
    </div>
  )
}
