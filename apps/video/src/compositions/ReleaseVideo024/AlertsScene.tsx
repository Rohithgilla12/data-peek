import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { Bell, Eye } from 'lucide-react'

const AMBER = brand.amber

// A row-count sparkline that climbs, then crosses the alert threshold.
const SPARK = [12, 13, 12, 14, 15, 17, 16, 19, 23, 28, 34]
const THRESHOLD_INDEX = 8

export const AlertsScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headerOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })

  // Sparkline draws over ~60 frames.
  const drawn = interpolate(frame, [20, 80], [0, SPARK.length - 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const W = 760
  const H = 180
  const max = Math.max(...SPARK)
  const min = Math.min(...SPARK)
  const pts = SPARK.map((v, i) => {
    const x = (i / (SPARK.length - 1)) * W
    const y = H - ((v - min) / (max - min)) * H
    return { x, y, v }
  })
  const visiblePts = pts.filter((_, i) => i <= drawn)
  const polyline = visiblePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const head = visiblePts[visiblePts.length - 1] ?? pts[0]

  // Notification fires once the line crosses the threshold (~frame 95).
  const notifSpring = spring({ frame: frame - 95, fps, config: { damping: 14, stiffness: 120 } })
  const notifX = interpolate(notifSpring, [0, 1], [460, 0])
  const notifOpacity = interpolate(frame, [95, 105], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bellWiggle = frame > 100 ? Math.sin((frame - 100) / fps * Math.PI * 6) * 8 : 0

  const thresholdY = H - ((SPARK[THRESHOLD_INDEX] - min) / (max - min)) * H

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30,
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Eye size={40} color={AMBER} strokeWidth={1.5} />
        <span
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 52,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: '-0.03em',
          }}
        >
          Watch Mode learned to shout
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          width: W + 80,
          padding: 40,
          borderRadius: 20,
          backgroundColor: brand.surface,
          border: `1px solid ${brand.border}`,
        }}
      >
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 24,
            color: brand.textSecondary,
            marginBottom: 20,
          }}
        >
          <span style={{ color: AMBER }}>watching</span> · SELECT count(*) FROM open_incidents
        </div>

        <svg width={W} height={H} style={{ overflow: 'visible' }}>
          {/* threshold line */}
          <line
            x1={0}
            y1={thresholdY}
            x2={W}
            y2={thresholdY}
            stroke={`${AMBER}66`}
            strokeWidth={2}
            strokeDasharray="6 6"
          />
          <polyline
            points={polyline}
            fill="none"
            stroke={AMBER}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={head.x} cy={head.y} r={7} fill={AMBER} />
        </svg>
      </div>

      {/* OS notification toast */}
      <div
        style={{
          position: 'absolute',
          right: 120,
          top: 140,
          transform: `translateX(${notifX}px)`,
          opacity: notifOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 26px',
          borderRadius: 18,
          backgroundColor: brand.surfaceElevated,
          border: `1px solid ${AMBER}55`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          width: 420,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: `${AMBER}1a`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${bellWiggle}deg)`,
          }}
        >
          <Bell size={26} color={AMBER} strokeWidth={2} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'Geist, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              color: brand.textPrimary,
            }}
          >
            data-peek
          </span>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 19,
              color: brand.textSecondary,
            }}
          >
            open_incidents crossed 24 → now 34
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
