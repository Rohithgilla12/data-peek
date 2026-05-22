import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { VersionBadge } from '../../components/VersionBadge'
import { TypewriterText } from '../../components/TypewriterText'
import { CyanGlow } from '../../components/CyanGlow'
import { Eye } from 'lucide-react'

type IntroProps = {
  version: string
}

export const Intro: React.FC<IntroProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const iconScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  })

  // Subtle pulse on the eye icon to evoke the watching state.
  const pulse = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2)

  const titleScale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 15, stiffness: 80 },
  })
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <CyanGlow size={500} delay={5} />

      <div
        style={{
          transform: `scale(${iconScale * pulse})`,
          marginBottom: 8,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -18,
            borderRadius: '50%',
            border: `2px solid ${brand.amber}55`,
            opacity: 0.6 + 0.4 * Math.sin((frame / fps) * Math.PI * 3),
          }}
        />
        <Eye size={72} color={brand.amber} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 88,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        data-peek
      </div>

      <Sequence from={15} layout="none">
        <VersionBadge version={version} />
      </Sequence>

      <Sequence from={35} layout="none">
        <TypewriterText
          text="Pin a query. See it move."
          charsPerSecond={28}
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 30,
            fontWeight: 400,
            color: brand.textMuted,
          }}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
