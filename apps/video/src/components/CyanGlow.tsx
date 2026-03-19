import { useCurrentFrame, interpolate } from 'remotion'
import { brand } from '../lib/colors'

type CyanGlowProps = {
  size?: number
  x?: string
  y?: string
  delay?: number
}

export const CyanGlow: React.FC<CyanGlowProps> = ({
  size = 400,
  x = '50%',
  y = '50%',
  delay = 0,
}) => {
  const frame = useCurrentFrame()

  const opacity = interpolate(frame - delay, [0, 30], [0, 0.6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${brand.accent}40 0%, transparent 70%)`,
        opacity,
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }}
    />
  )
}
