import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { CyanGlow } from '../../components/CyanGlow'

type ShortcutKeyProps = {
  keys: string[]
  description: string
  delay: number
  highlight?: boolean
}

const ShortcutKey: React.FC<ShortcutKeyProps> = ({ keys, description, delay, highlight }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [20, 0])

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 24px',
        backgroundColor: highlight ? `${brand.accent}10` : brand.surface,
        border: `1px solid ${highlight ? brand.accent : brand.border}`,
        borderRadius: 10,
        minWidth: 480,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {keys.map((key, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && (
              <span
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textMuted,
                  marginRight: 2,
                }}
              >
                +
              </span>
            )}
            <div
              style={{
                backgroundColor: brand.surfaceElevated,
                border: `1px solid ${brand.border}`,
                borderBottom: `3px solid ${brand.border}`,
                borderRadius: 6,
                padding: '4px 10px',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 14,
                fontWeight: 600,
                color: highlight ? brand.accent : brand.textPrimary,
                minWidth: 32,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {key}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 16,
          color: highlight ? brand.textPrimary : brand.textSecondary,
          fontWeight: highlight ? 500 : 400,
        }}
      >
        {description}
      </div>
    </div>
  )
}

type FocusedCellProps = {
  focusOffset: number
  label: string
  isFocused: boolean
}

const FocusedCell: React.FC<FocusedCellProps> = ({ focusOffset, label, isFocused }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])

  const ringPulse = interpolate(
    (frame % 60) / 60,
    [0, 0.5, 1],
    [0.6, 1, 0.6]
  )

  return (
    <div
      style={{
        opacity,
        position: 'relative',
        transform: `translateY(${focusOffset}px)`,
        transition: 'transform 0.3s',
        width: 600,
      }}
    >
      {isFocused && (
        <div
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: 10,
            border: `2px solid ${brand.accent}`,
            opacity: ringPulse,
            pointerEvents: 'none',
            boxShadow: `0 0 20px ${brand.accent}40`,
          }}
        />
      )}
      <div
        style={{
          backgroundColor: brand.surface,
          border: `1px solid ${brand.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              color: brand.accent,
              backgroundColor: `${brand.accent}15`,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Geist Mono, monospace',
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: '0.05em',
            }}
          >
            SQL
          </div>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 11,
              color: brand.textMuted,
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <pre
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              margin: 0,
              color: brand.textSecondary,
            }}
          >
            <span style={{ color: '#a855f7' }}>SELECT</span>
            <span style={{ color: brand.textSecondary }}> * </span>
            <span style={{ color: '#a855f7' }}>FROM</span>
            <span style={{ color: '#22d3ee' }}> {label === 'Cell 1' ? 'payments' : label === 'Cell 2' ? 'gateway_logs' : 'refunds'}</span>
          </pre>
        </div>
      </div>
    </div>
  )
}

export const KeyboardScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const focusOffset = (() => {
    if (frame < 40) return 0
    if (frame < 80) {
      const t = spring({ frame: frame - 40, fps, config: { damping: 200 } })
      return interpolate(t, [0, 1], [0, 80])
    }
    if (frame < 120) return 80
    if (frame < 160) {
      const t = spring({ frame: frame - 120, fps, config: { damping: 200 } })
      return interpolate(t, [0, 1], [80, 0])
    }
    return 0
  })()

  const focusedCellIndex = (() => {
    if (frame < 40) return 0
    if (frame < 120) return 1
    return 0
  })()

  const headerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const headerOpacity = interpolate(headerEntrance, [0, 1], [0, 1])
  const headerY = interpolate(headerEntrance, [0, 1], [30, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      <CyanGlow size={400} x="80%" y="20%" delay={0} />

      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 42,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.03em',
          marginBottom: 8,
        }}
      >
        Keyboard-first navigation
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 80 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Sequence from={10} layout="none">
            <ShortcutKey
              keys={['⇧', '⏎']}
              description="Run & advance to next cell"
              delay={0}
              highlight
            />
          </Sequence>
          <Sequence from={10} layout="none">
            <ShortcutKey
              keys={['⌘', '⏎']}
              description="Run cell in place"
              delay={15}
            />
          </Sequence>
          <Sequence from={10} layout="none">
            <ShortcutKey
              keys={['⌘', 'J']}
              description="Move focus down"
              delay={30}
            />
          </Sequence>
          <Sequence from={10} layout="none">
            <ShortcutKey
              keys={['⌘', 'K']}
              description="Move focus up"
              delay={45}
            />
          </Sequence>
          <Sequence from={10} layout="none">
            <ShortcutKey
              keys={['⌘', 'P']}
              description="Pin / unpin results"
              delay={60}
            />
          </Sequence>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            position: 'relative',
          }}
        >
          <Sequence from={5} layout="none">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FocusedCell focusOffset={-focusOffset} label="Cell 1" isFocused={focusedCellIndex === 0} />
              <FocusedCell focusOffset={-focusOffset + 80} label="Cell 2" isFocused={focusedCellIndex === 1} />
            </div>
          </Sequence>

          {frame >= 40 && frame < 80 && (
            <div
              style={{
                position: 'absolute',
                bottom: -40,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                color: brand.accent,
                opacity: interpolate(frame, [40, 50], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              ⌘+J — focus moves down
            </div>
          )}
          {frame >= 120 && frame < 160 && (
            <div
              style={{
                position: 'absolute',
                bottom: -40,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                color: brand.accent,
                opacity: interpolate(frame, [120, 130], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              ⌘+K — focus moves up
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  )
}