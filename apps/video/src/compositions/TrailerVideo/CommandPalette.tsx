import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { Search, ArrowRight } from 'lucide-react'

const results = [
  { kind: 'table', label: 'public.users', meta: '2,847 rows' },
  { kind: 'table', label: 'public.orders', meta: '12,401 rows' },
  { kind: 'query', label: 'Recent: daily active users', meta: 'Apr 12' },
  { kind: 'cmd', label: 'New query tab', meta: '⌘T' },
]

export const CommandPalette: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const containerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const containerOpacity = interpolate(containerEntrance, [0, 1], [0, 1])
  const containerTranslate = interpolate(containerEntrance, [0, 1], [20, 0])

  const queryText = 'users'
  const cps = 18
  const framesPerChar = fps / cps
  const queryFrame = Math.max(0, frame - 14)
  const charsVisible = Math.min(queryText.length, Math.floor(queryFrame / framesPerChar))

  const focusIndex = Math.min(results.length - 1, Math.floor(Math.max(0, frame - 70) / 22))

  const headingEntrance = spring({
    frame: frame - 130,
    fps,
    config: { damping: 200 },
  })
  const headingOpacity = interpolate(headingEntrance, [0, 1], [0, 1])
  const headingTranslate = interpolate(headingEntrance, [0, 1], [10, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
      }}
    >
      <div
        style={{
          opacity: containerOpacity,
          transform: `translateY(${containerTranslate}px)`,
          width: 720,
          backgroundColor: brand.surface,
          borderRadius: 16,
          border: `1px solid ${brand.border}`,
          boxShadow: `0 24px 60px ${brand.background}, 0 0 0 1px ${brand.accent}20`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 20px',
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <Search size={20} color={brand.textMuted} strokeWidth={1.8} />
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 20,
              color: brand.textPrimary,
              letterSpacing: '-0.01em',
            }}
          >
            {queryText.slice(0, charsVisible)}
          </span>
          {charsVisible < queryText.length && (
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 20,
                color: brand.accent,
                opacity: Math.round(frame / (fps / 2)) % 2 === 0 ? 1 : 0,
              }}
            >
              |
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>
        </div>

        <div style={{ padding: 8 }}>
          {results.map((r, i) => {
            const rowEntrance = spring({
              frame: frame - 30 - i * 7,
              fps,
              config: { damping: 200 },
            })
            const opacity = interpolate(rowEntrance, [0, 1], [0, 1])
            const isFocused = i === focusIndex
            return (
              <div
                key={r.label}
                style={{
                  opacity,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '11px 14px',
                  borderRadius: 10,
                  backgroundColor: isFocused ? `${brand.accent}12` : 'transparent',
                  border: `1px solid ${isFocused ? `${brand.accent}40` : 'transparent'}`,
                  transition: 'background-color 0.1s',
                }}
              >
                <Pill kind={r.kind} />
                <span
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 17,
                    color: isFocused ? brand.textPrimary : brand.textSecondary,
                    fontWeight: isFocused ? 500 : 400,
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 13,
                    color: brand.textMuted,
                  }}
                >
                  {r.meta}
                </span>
                {isFocused && (
                  <ArrowRight size={16} color={brand.accent} strokeWidth={2} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingTranslate}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 26,
          color: brand.textSecondary,
          letterSpacing: '-0.02em',
        }}
      >
        Keyboard-first. Like Linear. Like Raycast.
      </div>
    </AbsoluteFill>
  )
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      fontFamily: 'Geist Mono, monospace',
      fontSize: 13,
      color: brand.textMuted,
      padding: '3px 8px',
      borderRadius: 6,
      backgroundColor: brand.surfaceElevated,
      border: `1px solid ${brand.border}`,
      minWidth: 24,
      textAlign: 'center',
    }}
  >
    {children}
  </span>
)

const pillStyles: Record<string, { color: string; label: string }> = {
  table: { color: '#6b8cf5', label: 'TBL' },
  query: { color: '#f59e0b', label: 'SQL' },
  cmd: { color: '#a855f7', label: 'CMD' },
}

const Pill: React.FC<{ kind: string }> = ({ kind }) => {
  const { color, label } = pillStyles[kind] ?? pillStyles.table
  return (
    <span
      style={{
        fontFamily: 'Geist Mono, monospace',
        fontSize: 10,
        fontWeight: 600,
        color,
        padding: '2px 7px',
        borderRadius: 5,
        backgroundColor: `${color}15`,
        border: `1px solid ${color}30`,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        minWidth: 36,
        textAlign: 'center',
      }}
    >
      {label}
    </span>
  )
}
