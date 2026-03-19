import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { FeatureCard } from '../../components/FeatureCard'
import { CyanGlow } from '../../components/CyanGlow'
import type { LucideIcon } from 'lucide-react'

type FeatureSceneProps = {
  icon: LucideIcon
  title: string
  description: string
  color: string
  illustration: React.FC
}

export const FeatureScene: React.FC<FeatureSceneProps> = ({
  icon,
  title,
  description,
  color,
  illustration: Illustration,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const illustrationEntrance = spring({
    frame: frame - 15,
    fps,
    config: { damping: 200 },
  })
  const illustrationTranslate = interpolate(
    illustrationEntrance,
    [0, 1],
    [60, 0]
  )
  const illustrationOpacity = interpolate(
    illustrationEntrance,
    [0, 1],
    [0, 1]
  )

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0 120px',
        gap: 80,
      }}
    >
      <CyanGlow size={300} x="25%" y="50%" delay={0} />
      <div
        style={{
          position: 'absolute',
          left: '70%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}25 0%, transparent 70%)`,
          opacity: 0.5,
          filter: 'blur(60px)',
        }}
      />

      <div style={{ flex: 1 }}>
        <Sequence from={0} layout="none">
          <FeatureCard
            icon={icon}
            title={title}
            description={description}
            color={color}
          />
        </Sequence>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: illustrationOpacity,
          transform: `translateX(${illustrationTranslate}px)`,
        }}
      >
        <Illustration />
      </div>
    </AbsoluteFill>
  )
}
