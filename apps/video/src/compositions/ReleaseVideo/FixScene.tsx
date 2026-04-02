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
import type { LucideIcon } from 'lucide-react'

type FixSceneProps = {
  icon: LucideIcon
  title: string
  description: string
  color: string
  illustration: React.FC
}

export const FixScene: React.FC<FixSceneProps> = ({
  icon: Icon,
  title,
  description,
  color,
  illustration: Illustration,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardEntrance = spring({
    frame,
    fps,
    config: { damping: 200 },
  })
  const cardTranslateY = interpolate(cardEntrance, [0, 1], [40, 0])
  const cardOpacity = interpolate(cardEntrance, [0, 1], [0, 1])

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

      <div
        style={{
          flex: 1,
          opacity: cardOpacity,
          transform: `translateY(${cardTranslateY}px)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: `${color}15`,
            border: `1px solid ${color}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={36} color={color} strokeWidth={1.5} />
        </div>
        <h2
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 44,
            fontWeight: 700,
            color: brand.textPrimary,
            margin: 0,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </h2>
        <Sequence from={10} layout="none">
          <DescriptionReveal text={description} />
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

const DescriptionReveal: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [12, 0])

  return (
    <p
      style={{
        fontFamily: 'Geist Mono, monospace',
        fontSize: 22,
        fontWeight: 400,
        color: brand.textSecondary,
        margin: 0,
        maxWidth: 480,
        lineHeight: 1.5,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {text}
    </p>
  )
}
