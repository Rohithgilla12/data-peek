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

export const EndScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  const iconEntrance = spring({ frame, fps, config: { damping: 12, stiffness: 100 } })
  const iconScale = interpolate(iconEntrance, [0, 1], [0, 1])
  const iconRotate = interpolate(iconEntrance, [0, 1], [-180, 0])

  const titleEntrance = spring({ frame: frame - 10, fps, config: { damping: 200 } })
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1])
  const titleY = interpolate(titleEntrance, [0, 1], [30, 0])

  const versionEntrance = spring({ frame: frame - 25, fps, config: { damping: 200 } })
  const versionOpacity = interpolate(versionEntrance, [0, 1], [0, 1])
  const versionY = interpolate(versionEntrance, [0, 1], [20, 0])

  const ctaEntrance = spring({ frame: frame - 45, fps, config: { damping: 200 } })
  const ctaOpacity = interpolate(ctaEntrance, [0, 1], [0, 1])
  const ctaY = interpolate(ctaEntrance, [0, 1], [20, 0])

  const taglineEntrance = spring({ frame: frame - 60, fps, config: { damping: 200 } })
  const taglineOpacity = interpolate(taglineEntrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        opacity: fadeOut,
      }}
    >
      <CyanGlow size={600} delay={0} />

      <div
        style={{
          transform: `scale(${iconScale}) rotate(${iconRotate}deg)`,
          marginBottom: 4,
        }}
      >
        <BookOpen size={56} color={brand.accent} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 80,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        SQL Notebooks
      </div>

      <div
        style={{
          opacity: versionOpacity,
          transform: `translateY(${versionY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 22,
          color: brand.textMuted,
          letterSpacing: '-0.01em',
        }}
      >
        in{' '}
        <span style={{ color: brand.accent, fontWeight: 600 }}>
          data-peek v0.20.0
        </span>
      </div>

      <Sequence from={45} layout="none">
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 16,
              color: brand.textMuted,
            }}
          >
            Available now at
          </div>
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 36,
              fontWeight: 700,
              color: brand.accent,
              borderBottom: `2px solid ${brand.accent}60`,
              paddingBottom: 4,
              letterSpacing: '-0.02em',
            }}
          >
            datapeek.dev
          </div>
        </div>
      </Sequence>

      <Sequence from={60} layout="none">
        <div
          style={{
            opacity: taglineOpacity,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 14,
            color: brand.textMuted,
            marginTop: 8,
          }}
        >
          Fast. Honest. Modern devtool.
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
