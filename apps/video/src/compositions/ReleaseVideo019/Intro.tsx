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
import { Globe } from 'lucide-react'

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
  const iconRotate = interpolate(iconScale, [0, 1], [-180, 0])

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
          transform: `scale(${iconScale}) rotate(${iconRotate}deg)`,
          marginBottom: 8,
        }}
      >
        <Globe size={64} color={brand.accent} strokeWidth={1.5} />
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
          text="Desktop meets web. Your SQL, everywhere."
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
