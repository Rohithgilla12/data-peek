import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { GitCompareArrows } from 'lucide-react'

const GREEN = '#10b981'
const RED = '#ef4444'

// Diffing 14:15 → 14:36: one changed cell per existing row, one new row.
const ROWS = [
  { id: 1042, status: 'pending', kind: 'added' as const },
  { id: 1041, status: 'shipped', old: 'pending', kind: 'changed' as const },
  { id: 1040, status: 'delivered', old: 'shipped', kind: 'changed' as const },
  { id: 1039, status: 'shipped', kind: 'same' as const },
]

export const DiffScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headerOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })
  const cardScale = spring({ frame: frame - 8, fps, config: { damping: 15, stiffness: 90 } })

  // Highlights land row by row after the card settles.
  const highlight = (i: number) =>
    interpolate(frame, [40 + i * 12, 52 + i * 12], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

  const badgeIn = (i: number) =>
    spring({ frame: frame - (85 + i * 6), fps, config: { damping: 13, stiffness: 130 } })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
      }}
    >
      <div style={{ opacity: headerOpacity, display: 'flex', alignItems: 'center', gap: 16 }}>
        <GitCompareArrows size={40} color={brand.amber} strokeWidth={1.5} />
        <span
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 52,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: '-0.03em',
          }}
        >
          Diff any two runs
        </span>
      </div>

      <div
        style={{
          transform: `scale(${cardScale})`,
          width: 980,
          borderRadius: 20,
          backgroundColor: brand.surface,
          border: `1px solid ${brand.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '16px 28px',
            borderBottom: `1px solid ${brand.border}`,
            backgroundColor: brand.surfaceElevated,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 21,
          }}
        >
          <span style={{ color: brand.textSecondary }}>14:15 → 14:36</span>
          <span
            style={{
              transform: `scale(${badgeIn(0)})`,
              padding: '4px 12px',
              borderRadius: 8,
              color: GREEN,
              backgroundColor: `${GREEN}1f`,
            }}
          >
            +1 added
          </span>
          <span
            style={{
              transform: `scale(${badgeIn(1)})`,
              padding: '4px 12px',
              borderRadius: 8,
              color: RED,
              backgroundColor: `${RED}1f`,
            }}
          >
            −1 removed
          </span>
          <span
            style={{
              transform: `scale(${badgeIn(2)})`,
              padding: '4px 12px',
              borderRadius: 8,
              color: brand.amber,
              backgroundColor: `${brand.amber}1f`,
            }}
          >
            2 cells changed
          </span>
          <span style={{ marginLeft: 'auto', color: brand.textMuted, fontSize: 19 }}>
            keyed by id
          </span>
        </div>

        <div style={{ padding: '10px 28px 22px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              fontFamily: 'Geist Mono, monospace',
              fontSize: 21,
              color: brand.textMuted,
              padding: '10px 0',
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <span>id</span>
            <span>status</span>
          </div>
          {ROWS.map((row, i) => {
            const t = highlight(i)
            const rowBg =
              row.kind === 'added' ? `rgba(16, 185, 129, ${0.16 * t})` : 'transparent'
            const cellBg =
              row.kind === 'changed' ? `rgba(251, 191, 36, ${0.2 * t})` : 'transparent'
            return (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 22,
                  color: brand.textPrimary,
                  padding: '12px 0',
                  borderBottom: `1px solid ${brand.border}55`,
                  backgroundColor: rowBg,
                  borderLeft:
                    row.kind === 'added'
                      ? `3px solid rgba(16, 185, 129, ${t})`
                      : '3px solid transparent',
                  paddingLeft: 10,
                }}
              >
                <span style={{ color: brand.textSecondary }}>{row.id}</span>
                <span
                  style={{
                    backgroundColor: cellBg,
                    borderRadius: 6,
                    padding: '0 8px',
                    width: 'fit-content',
                  }}
                >
                  {row.kind === 'changed' && (
                    <span
                      style={{
                        opacity: 0.55 * t,
                        textDecoration: 'line-through',
                        color: brand.textMuted,
                        marginRight: 12,
                      }}
                    >
                      {row.old}
                    </span>
                  )}
                  {row.status}
                  {row.kind === 'added' && (
                    <span style={{ color: GREEN, marginLeft: 12, opacity: t }}>new</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div
        style={{
          opacity: interpolate(frame, [125, 140], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          color: brand.textMuted,
        }}
      >
        Before the migration. After the migration. Diff the two.
      </div>
    </AbsoluteFill>
  )
}
