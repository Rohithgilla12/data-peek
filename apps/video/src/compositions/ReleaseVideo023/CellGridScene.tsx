import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { CyanGlow } from '../../components/CyanGlow'
import { Keyboard } from 'lucide-react'

/**
 * Cell-grid scene: a focused cell ring snaps between cells via deterministic
 * arrow-key choreography, then Enter docks an inspector that scrubs in
 * lockstep with the cursor. ~150 frames (5s).
 */

const COL_COUNT = 4
const ROW_COUNT = 6
const ROW_HEIGHT = 38
const HEADER_HEIGHT = 36
const COLUMN_WIDTHS = [70, 280, 110, 160] as const
const TOTAL_GRID_WIDTH = COLUMN_WIDTHS.reduce((a, b) => a + b, 0)

const columns = [
  { name: 'id', type: 'int4' },
  { name: 'email', type: 'text' },
  { name: 'plan', type: 'text' },
  { name: 'created_at', type: 'timestamptz' },
] as const

type Row = readonly [number, string, 'free' | 'pro' | 'enterprise', string]
const rows: Row[] = [
  [1842, 'jordan@cmp.io', 'pro', '2026-04-12 08:43:12+00'],
  [1843, 'sam.lee.developer@really-long-domain.example.com', 'free', '2026-04-12 09:11:04+00'],
  [1844, 'ana@cmp.io', 'enterprise', '2026-04-13 14:22:51+00'],
  [1845, 'devops-bot+notifications@cmp.io', 'pro', '2026-04-14 07:05:33+00'],
  [1846, 'hi@k.so', 'free', '2026-04-14 10:50:18+00'],
  [1847, 'billing@cmp.io', 'pro', '2026-04-15 12:18:47+00'],
]

type ArrowKey = 'right' | 'down' | 'enter'
type KeyEvent = { frame: number; key: ArrowKey }

// Choreography — starts at (0,0), each event advances focus and (eventually) opens inspector.
const events: KeyEvent[] = [
  { frame: 26, key: 'right' }, // (0,0) → (1,0) — long email cell
  { frame: 42, key: 'down' }, // (1,0) → (1,1)
  { frame: 58, key: 'enter' }, // open inspector at (1,1)
  { frame: 88, key: 'down' }, // (1,1) → (1,2)
  { frame: 104, key: 'right' }, // (1,2) → (2,2)
  { frame: 120, key: 'down' }, // (2,2) → (2,3)
]

interface FocusState {
  col: number
  row: number
  changedAt: number
  inspectorOpenAtFrame: number | null
  lastKey: ArrowKey | null
  lastKeyFrame: number
}

function resolveFocus(frame: number): FocusState {
  let col = 0
  let row = 0
  let changedAt = 0
  let inspectorOpenAtFrame: number | null = null
  let lastKey: ArrowKey | null = null
  let lastKeyFrame = -100
  for (const ev of events) {
    if (ev.frame > frame) break
    lastKey = ev.key
    lastKeyFrame = ev.frame
    if (ev.key === 'right') {
      col = Math.min(col + 1, COL_COUNT - 1)
      changedAt = ev.frame
    } else if (ev.key === 'down') {
      row = Math.min(row + 1, ROW_COUNT - 1)
      changedAt = ev.frame
    } else if (ev.key === 'enter' && inspectorOpenAtFrame === null) {
      inspectorOpenAtFrame = ev.frame
    }
  }
  return { col, row, changedAt, inspectorOpenAtFrame, lastKey, lastKeyFrame }
}

const ACCENT = brand.accent

export const CellGridScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardEntrance = spring({ frame, fps, config: { damping: 200 } })
  const cardOpacity = interpolate(cardEntrance, [0, 1], [0, 1])
  const cardTy = interpolate(cardEntrance, [0, 1], [30, 0])

  const focus = resolveFocus(frame)

  // Geometry: prefix-sum x offsets, fixed row height.
  const colOffsets: number[] = []
  {
    let running = 0
    for (const w of COLUMN_WIDTHS) {
      colOffsets.push(running)
      running += w
    }
  }
  const targetX = colOffsets[focus.col]
  const targetW = COLUMN_WIDTHS[focus.col]
  const targetY = HEADER_HEIGHT + focus.row * ROW_HEIGHT

  // Snap interpolation — match the 160ms snap from the real grid.
  const ringX = interpolate(
    frame,
    [focus.changedAt, focus.changedAt + Math.round(fps * 0.16)],
    [colOffsets[focus.col === 0 ? 0 : Math.max(0, focus.col)], targetX],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingSnap }
  )
  // Animate Y similarly by interpolating from previous-row position. For
  // determinism we just snap-with-easing toward target from where we were
  // a frame before the change.
  const prevY =
    focus.changedAt === 0
      ? targetY
      : HEADER_HEIGHT +
        (resolveFocus(focus.changedAt - 1).row) * ROW_HEIGHT
  const prevX =
    focus.changedAt === 0
      ? targetX
      : colOffsets[resolveFocus(focus.changedAt - 1).col]
  const animX = interpolate(
    frame,
    [focus.changedAt, focus.changedAt + Math.round(fps * 0.16)],
    [prevX, targetX],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingSnap }
  )
  const animY = interpolate(
    frame,
    [focus.changedAt, focus.changedAt + Math.round(fps * 0.16)],
    [prevY, targetY],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingSnap }
  )
  const animW = targetW

  const inspectorOpen = focus.inspectorOpenAtFrame !== null
  const inspectorAge = inspectorOpen
    ? frame - (focus.inspectorOpenAtFrame as number)
    : -1
  const inspectorEntrance = inspectorOpen
    ? Math.min(1, Math.max(0, inspectorAge / Math.round(fps * 0.22)))
    : 0
  const inspectorOpacity = inspectorEntrance
  const inspectorTx = interpolate(inspectorEntrance, [0, 1], [40, 0])

  const focusedCellValue = String(rows[focus.row][focus.col])
  const focusedCol = columns[focus.col]
  const focusedRow = rows[focus.row]

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 60px',
        gap: 16,
      }}
    >
      <CyanGlow size={420} y="42%" delay={0} />

      <KeyTicker lastKey={focus.lastKey} lastKeyFrame={focus.lastKeyFrame} frame={frame} fps={fps} />

      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardTy}px)`,
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        {/* Grid card */}
        <div
          style={{
            width: TOTAL_GRID_WIDTH + 56,
            backgroundColor: brand.surface,
            borderRadius: 16,
            border: `1px solid ${brand.border}`,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Title bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingBottom: 12,
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <Keyboard size={16} color={ACCENT} />
            <code
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 14,
                color: brand.textSecondary,
                flex: 1,
              }}
            >
              SELECT id, email, plan, created_at FROM users LIMIT 6
            </code>
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                color: brand.textMuted,
              }}
            >
              {rows.length} rows
            </span>
          </div>

          {/* Grid + focus overlay */}
          <div style={{ position: 'relative', width: TOTAL_GRID_WIDTH, height: HEADER_HEIGHT + ROW_COUNT * ROW_HEIGHT }}>
            {/* Header */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: TOTAL_GRID_WIDTH,
                height: HEADER_HEIGHT,
                display: 'flex',
                borderBottom: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                alignItems: 'center',
              }}
            >
              {columns.map((c, i) => (
                <div
                  key={c.name}
                  style={{
                    width: COLUMN_WIDTHS[i],
                    paddingLeft: 10,
                    paddingRight: 10,
                  }}
                >
                  {c.name}
                </div>
              ))}
            </div>

            {/* Row stripe (focused row) */}
            <div
              style={{
                position: 'absolute',
                top: HEADER_HEIGHT + focus.row * ROW_HEIGHT,
                left: 0,
                width: TOTAL_GRID_WIDTH,
                height: ROW_HEIGHT,
                background: `${ACCENT}0d`,
                transition: 'top 160ms',
                pointerEvents: 'none',
              }}
            />

            {/* Cells */}
            {rows.map((r, ri) => (
              <div
                key={ri}
                style={{
                  position: 'absolute',
                  top: HEADER_HEIGHT + ri * ROW_HEIGHT,
                  left: 0,
                  width: TOTAL_GRID_WIDTH,
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 14,
                  color: brand.textPrimary,
                  borderBottom:
                    ri === rows.length - 1
                      ? 'none'
                      : `1px solid ${brand.border}30`,
                }}
              >
                {r.map((v, ci) => (
                  <div
                    key={ci}
                    style={{
                      width: COLUMN_WIDTHS[ci],
                      paddingLeft: 10,
                      paddingRight: 10,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color:
                        ci === 0
                          ? brand.textMuted
                          : ci === 2
                            ? planColor(v as string)
                            : brand.textSecondary,
                    }}
                  >
                    {String(v)}
                  </div>
                ))}
              </div>
            ))}

            {/* Focus ring overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: animW,
                height: ROW_HEIGHT,
                transform: `translate3d(${animX}px, ${animY}px, 0)`,
                background: `${ACCENT}1f`,
                boxShadow: `inset 0 0 0 1px ${ACCENT}40, 0 0 0 2px ${ACCENT}`,
                borderRadius: 4,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>

        {/* Inspector */}
        {inspectorOpen && (
          <div
            style={{
              opacity: inspectorOpacity,
              transform: `translateX(${inspectorTx}px)`,
              width: 360,
              backgroundColor: brand.surface,
              borderRadius: 16,
              border: `1px solid ${ACCENT}40`,
              boxShadow: `0 0 0 1px ${ACCENT}1a`,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 10,
                borderBottom: `1px solid ${brand.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: brand.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Inspector
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: brand.textMuted,
                  padding: '3px 8px',
                  border: `1px solid ${brand.border}`,
                  borderRadius: 6,
                }}
              >
                Esc to close
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  color: brand.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {focusedCol.name}
              </span>
              <span style={{ fontSize: 11, color: ACCENT }}>{focusedCol.type}</span>
            </div>

            <div
              style={{
                fontSize: 15,
                color: brand.textPrimary,
                lineHeight: 1.4,
                wordBreak: 'break-all',
                padding: '12px 14px',
                background: `${ACCENT}08`,
                borderRadius: 8,
                border: `1px solid ${brand.border}`,
                minHeight: 60,
              }}
            >
              {focusedCellValue}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 16,
                fontSize: 11,
                color: brand.textMuted,
                paddingTop: 10,
                borderTop: `1px solid ${brand.border}`,
              }}
            >
              <span>
                {focusedCellValue.length} chars
              </span>
              <span>·</span>
              <span>{byteCount(focusedCellValue)} bytes</span>
              <span style={{ marginLeft: 'auto', color: brand.textSecondary }}>
                row {focus.row + 1} of {ROW_COUNT}
              </span>
            </div>
          </div>
        )}
      </div>

      <Caption frame={frame} fps={fps} />
    </AbsoluteFill>
  )
}

function easingSnap(t: number): number {
  // cubic-bezier(0.32, 0.72, 0, 1) approximation — fast start, soft landing.
  return 1 - Math.pow(1 - t, 3)
}

function planColor(plan: string): string {
  if (plan === 'pro') return brand.accent
  if (plan === 'enterprise') return brand.purple
  return brand.textMuted
}

function byteCount(s: string): number {
  // Approximation; for ASCII matches char count. Realistic for the demo data.
  return new TextEncoder().encode(s).length
}

const KeyTicker: React.FC<{
  lastKey: ArrowKey | null
  lastKeyFrame: number
  frame: number
  fps: number
}> = ({ lastKey, lastKeyFrame, frame, fps }) => {
  const age = frame - lastKeyFrame
  const visible = lastKey !== null && age >= 0 && age < fps * 0.7
  const op = visible ? Math.max(0, 1 - age / (fps * 0.7)) : 0
  const label =
    lastKey === 'right'
      ? '→'
      : lastKey === 'down'
        ? '↓'
        : lastKey === 'enter'
          ? 'Enter'
          : ''

  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: 0.95,
      }}
    >
      <span
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        Keyboard
      </span>
      <span
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 16,
          padding: '4px 12px',
          minWidth: 56,
          textAlign: 'center',
          borderRadius: 6,
          color: brand.accent,
          background: `${brand.accent}14`,
          border: `1px solid ${brand.accent}33`,
          opacity: op,
        }}
      >
        {label || ' '}
      </span>
    </div>
  )
}

const Caption: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div
      style={{
        opacity: op,
        fontFamily: 'Geist Mono, monospace',
        fontSize: 18,
        color: brand.textMuted,
        marginTop: 4,
      }}
    >
      arrow keys move · Enter inspects · Cmd+C copies
    </div>
  )
}
