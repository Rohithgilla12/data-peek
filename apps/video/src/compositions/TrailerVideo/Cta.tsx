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
import { Star, ArrowRight, Database } from 'lucide-react'

export const Cta: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  const iconEntrance = spring({ frame, fps, config: { damping: 12, stiffness: 100 } })
  const iconScale = interpolate(iconEntrance, [0, 1], [0.5, 1])

  const wordmarkEntrance = spring({
    frame: frame - 8,
    fps,
    config: { damping: 15, stiffness: 80 },
  })
  const wordmarkOpacity = interpolate(wordmarkEntrance, [0, 1], [0, 1])
  const wordmarkScale = interpolate(wordmarkEntrance, [0, 1], [0.94, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        opacity: fadeOut,
      }}
    >
      <CyanGlow size={680} delay={0} />

      <div style={{ transform: `scale(${iconScale})` }}>
        <Database size={64} color={brand.accent} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: wordmarkOpacity,
          transform: `scale(${wordmarkScale})`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 88,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        data-peek
      </div>

      <Sequence from={32} layout="none">
        <UrlPill />
      </Sequence>

      <Sequence from={90} layout="none">
        <GithubCta />
      </Sequence>

      <Sequence from={170} layout="none">
        <Sub />
      </Sequence>
    </AbsoluteFill>
  )
}

const UrlPill: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 14, stiffness: 90 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const scale = interpolate(entrance, [0, 1], [0.9, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          marginTop: 240,
          opacity,
          transform: `scale(${scale})`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 26px',
          backgroundColor: brand.surface,
          borderRadius: 999,
          border: `1px solid ${brand.accent}40`,
          boxShadow: `0 0 40px ${brand.accent}25`,
        }}
      >
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 34,
            fontWeight: 500,
            color: brand.accent,
            letterSpacing: '-0.02em',
          }}
        >
          datapeek.dev
        </span>
        <ArrowRight size={26} color={brand.accent} strokeWidth={2} />
      </div>
    </AbsoluteFill>
  )
}

const GithubCta: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [10, 0])

  const starPulse = Math.sin(frame * 0.08) * 0.06 + 1

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          marginTop: 360,
          opacity,
          transform: `translateY(${translateY}px)`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 22px',
          borderRadius: 12,
          backgroundColor: brand.surfaceElevated,
          border: `1px solid ${brand.border}`,
        }}
      >
        <span style={{ transform: `scale(${starPulse})` }}>
          <Star size={22} color="#fbbf24" fill="#fbbf24" strokeWidth={1.5} />
        </span>
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 22,
            color: brand.textPrimary,
            fontWeight: 500,
          }}
        >
          Star on GitHub
        </span>
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 16,
            color: brand.textMuted,
          }}
        >
          /Rohithgilla12/data-peek
        </span>
      </div>
    </AbsoluteFill>
  )
}

const Sub: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'none',
        paddingBottom: 120,
      }}
    >
      <div
        style={{
          opacity,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 18,
          color: brand.textMuted,
          letterSpacing: '-0.01em',
        }}
      >
        macOS · Windows · Linux
      </div>
    </AbsoluteFill>
  )
}
