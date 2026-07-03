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

type OutroProps = {
  version: string
}

export const Outro: React.FC<OutroProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const fadeOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 90 } })
  const taglineOpacity = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        opacity: fadeOut,
      }}
    >
      <CyanGlow size={500} delay={0} />

      <div
        style={{
          transform: `scale(${logoScale})`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 80,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        data-peek <span style={{ color: brand.accent }}>{version}</span>
      </div>

      <Sequence from={18} layout="none">
        <div
          style={{
            opacity: taglineOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 30,
              color: brand.textSecondary,
            }}
          >
            Free for personal use. No account. No telemetry.
          </span>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 26,
              color: brand.accent,
            }}
          >
            github.com/Rohithgilla12/data-peek
          </span>
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
