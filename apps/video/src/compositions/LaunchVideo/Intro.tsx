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

type IntroProps = {
  version: string
}

export const Intro: React.FC<IntroProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleScale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  })
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
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
      <CyanGlow size={600} delay={10} />

      <div
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 96,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.05em',
        }}
      >
        data-peek
      </div>

      <Sequence from={20} layout="none">
        <VersionBadge version={version} />
      </Sequence>

      <Sequence from={45} layout="none">
        <TypewriterText
          text="6 new features. Zero bloat."
          charsPerSecond={25}
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 32,
            fontWeight: 400,
            color: brand.textMuted,
          }}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
