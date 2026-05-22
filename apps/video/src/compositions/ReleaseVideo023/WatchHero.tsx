import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { CyanGlow } from '../../components/CyanGlow'
import { Eye } from 'lucide-react'

/**
 * Hero scene: a faux query result grid where rows flicker through statuses,
 * cells flash amber on change, and a new row enters with a green band — the
 * visual signature of Watch Mode. Plays for ~6s.
 *
 * The data and timings are baked in (deterministic) so the same composition
 * renders identically every time. No real polling.
 */

interface RowState {
  id: number
  status: 'pending' | 'processing' | 'done'
  duration: string
}

const AMBER = '#fbbf24'
const AMBER_FADE_FRAMES = 60 // ~2s at 30fps
const GREEN = '#10b981'
const GREEN_FADE_FRAMES = 90

// Choreography — each entry says: at frame F, row R changes column C to V.
type Event =
  | { frame: number; kind: 'cell'; row: number; col: 'status'; value: RowState['status'] }
  | { frame: number; kind: 'cell'; row: number; col: 'duration'; value: string }
  | { frame: number; kind: 'add'; row: number; status: RowState['status']; duration: string }

const initialRows: RowState[] = [
  { id: 5021, status: 'processing', duration: '1.4s' },
  { id: 5022, status: 'pending', duration: '—' },
  { id: 5023, status: 'pending', duration: '—' },
  { id: 5024, status: 'pending', duration: '—' },
  { id: 5025, status: 'pending', duration: '—' },
]

const events: Event[] = [
  { frame: 24, kind: 'cell', row: 0, col: 'status', value: 'done' },
  { frame: 24, kind: 'cell', row: 0, col: 'duration', value: '2.1s' },
  { frame: 32, kind: 'cell', row: 1, col: 'status', value: 'processing' },
  { frame: 32, kind: 'cell', row: 1, col: 'duration', value: '0.4s' },
  { frame: 64, kind: 'cell', row: 1, col: 'status', value: 'done' },
  { frame: 64, kind: 'cell', row: 1, col: 'duration', value: '1.8s' },
  { frame: 78, kind: 'cell', row: 2, col: 'status', value: 'processing' },
  { frame: 78, kind: 'cell', row: 2, col: 'duration', value: '0.3s' },
  { frame: 96, kind: 'add', row: 5, status: 'pending', duration: '—' },
  { frame: 120, kind: 'cell', row: 2, col: 'status', value: 'done' },
  { frame: 120, kind: 'cell', row: 2, col: 'duration', value: '1.5s' },
  { frame: 132, kind: 'cell', row: 3, col: 'status', value: 'processing' },
  { frame: 132, kind: 'cell', row: 3, col: 'duration', value: '0.2s' },
  { frame: 150, kind: 'add', row: 6, status: 'pending', duration: '—' },
]

interface ResolvedRow extends RowState {
  enteredAtFrame: number | null
  cellChangedAt: { status?: number; duration?: number }
}

function resolveRowsAtFrame(frame: number): ResolvedRow[] {
  const rows: ResolvedRow[] = initialRows.map((r) => ({
    ...r,
    enteredAtFrame: null,
    cellChangedAt: {}
  }))

  for (const ev of events) {
    if (ev.frame > frame) break
    if (ev.kind === 'add') {
      const id = 5020 + ev.row + 1
      rows.push({
        id,
        status: ev.status,
        duration: ev.duration,
        enteredAtFrame: ev.frame,
        cellChangedAt: {}
      })
    } else if (ev.kind === 'cell') {
      const r = rows[ev.row]
      if (!r) continue
      // @ts-expect-error indexed by col name
      r[ev.col] = ev.value
      r.cellChangedAt[ev.col] = ev.frame
    }
  }
  return rows
}

const statusColors: Record<RowState['status'], string> = {
  pending: brand.textMuted,
  processing: brand.accent,
  done: GREEN
}

export const WatchHero: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardEntrance = spring({ frame, fps, config: { damping: 200 } })
  const cardOpacity = interpolate(cardEntrance, [0, 1], [0, 1])
  const cardTy = interpolate(cardEntrance, [0, 1], [30, 0])

  const rows = resolveRowsAtFrame(frame)

  // Watching countdown — tick counter that advances every ~36 frames (1.2s).
  const tickCount = Math.floor(frame / 36)
  const countdown = Math.max(0, 5 - (frame % 36) / 6)
  const countdownLabel = `Watching · ${countdown.toFixed(1)}s`

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 60px',
        gap: 24,
      }}
    >
      <CyanGlow size={400} y="40%" delay={0} />

      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardTy}px)`,
          width: 980,
          backgroundColor: brand.surface,
          borderRadius: 16,
          border: `1px solid ${brand.border}`,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingBottom: 14,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <Eye size={18} color={AMBER} />
          <code
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 15,
              color: brand.textSecondary,
              flex: 1,
            }}
          >
            SELECT id, status, duration FROM jobs ORDER BY id DESC LIMIT 10
          </code>
          <WatchingPill label={countdownLabel} />
        </div>

        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 1fr',
            gap: 0,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: brand.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            paddingBottom: 8,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <div>id</div>
          <div>status</div>
          <div>duration</div>
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((row, idx) => {
            const addedAge =
              row.enteredAtFrame !== null ? frame - row.enteredAtFrame : null
            const addedIntensity =
              addedAge !== null
                ? Math.max(0, 1 - addedAge / GREEN_FADE_FRAMES)
                : 0
            const statusChangedAge = row.cellChangedAt.status
              ? frame - row.cellChangedAt.status
              : null
            const durationChangedAge = row.cellChangedAt.duration
              ? frame - row.cellChangedAt.duration
              : null

            const statusIntensity =
              statusChangedAge !== null
                ? Math.max(0, 1 - statusChangedAge / AMBER_FADE_FRAMES)
                : 0
            const durationIntensity =
              durationChangedAge !== null
                ? Math.max(0, 1 - durationChangedAge / AMBER_FADE_FRAMES)
                : 0

            const enterScale =
              addedAge !== null && addedAge < 6
                ? interpolate(addedAge, [0, 6], [0.92, 1])
                : 1
            const enterOpacity =
              addedAge !== null && addedAge < 10
                ? interpolate(addedAge, [0, 10], [0, 1])
                : 1

            return (
              <div
                key={row.id}
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 1fr',
                  alignItems: 'center',
                  height: 42,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 15,
                  color: brand.textPrimary,
                  borderBottom:
                    idx === rows.length - 1 ? 'none' : `1px solid ${brand.border}30`,
                  transform: `scale(${enterScale})`,
                  opacity: enterOpacity,
                  transformOrigin: 'left center',
                }}
              >
                {/* Added-row green band */}
                {addedIntensity > 0.02 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderLeft: `3px solid ${GREEN}`,
                      background: `${GREEN}1f`,
                      opacity: addedIntensity,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                <div style={{ position: 'relative', color: brand.textMuted }}>
                  {row.id}
                </div>
                <div
                  style={{
                    position: 'relative',
                    color: statusColors[row.status],
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {statusIntensity > 0.02 && <CellFlash intensity={statusIntensity} />}
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: statusColors[row.status],
                    }}
                  />
                  {row.status}
                </div>
                <div style={{ position: 'relative', color: brand.textSecondary }}>
                  {durationIntensity > 0.02 && (
                    <CellFlash intensity={durationIntensity} />
                  )}
                  {row.duration}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: `1px solid ${brand.border}`,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 13,
            color: brand.textMuted,
          }}
        >
          <span>{rows.length} rows</span>
          <span>
            tick {tickCount + 1} · {countdownLabel}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}

const CellFlash: React.FC<{ intensity: number }> = ({ intensity }) => (
  <div
    style={{
      position: 'absolute',
      inset: -8,
      borderLeft: `2px solid ${AMBER}`,
      background: `${AMBER}22`,
      opacity: intensity,
      pointerEvents: 'none',
      borderRadius: 2,
    }}
  />
)

const WatchingPill: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame()
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin((frame / 30) * Math.PI))
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        backgroundColor: `${AMBER}14`,
        border: `1px solid ${AMBER}40`,
        fontFamily: 'Geist Mono, monospace',
        fontSize: 13,
        color: AMBER,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: AMBER,
          opacity: pulse,
        }}
      />
      {label}
    </div>
  )
}
