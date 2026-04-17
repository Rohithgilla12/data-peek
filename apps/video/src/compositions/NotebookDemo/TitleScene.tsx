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
import { BookOpen } from 'lucide-react'

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const iconScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const iconRotate = interpolate(iconScale, [0, 1], [-180, 0])

  const titleEntrance = spring({
    frame: frame - 8,
    fps,
    config: { damping: 15, stiffness: 80 },
  })
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], {
    extrapolateRight: 'clamp',
  })
  const titleY = interpolate(titleEntrance, [0, 1], [30, 0])

  const subtitleEntrance = spring({
    frame: frame - 25,
    fps,
    config: { damping: 200 },
  })
  const subtitleOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1])
  const subtitleY = interpolate(subtitleEntrance, [0, 1], [20, 0])

  const logoEntrance = spring({
    frame: frame - 45,
    fps,
    config: { damping: 200 },
  })
  const logoOpacity = interpolate(logoEntrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      <CyanGlow size={600} delay={5} />

      <div
        style={{
          transform: `scale(${iconScale}) rotate(${iconRotate}deg)`,
          marginBottom: 4,
        }}
      >
        <BookOpen size={72} color={brand.accent} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 96,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        SQL Notebooks
      </div>

      <div
        style={{
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 32,
          fontWeight: 400,
          color: brand.textMuted,
          letterSpacing: '-0.02em',
        }}
      >
        Runbooks that actually run.
      </div>

      <Sequence from={45} layout="none">
        <div
          style={{
            opacity: logoOpacity,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 18,
            fontWeight: 500,
            color: brand.textMuted,
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: brand.accent }}>data-peek</span>
          <span>·</span>
          <span>v0.20.0</span>
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
