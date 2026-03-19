import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'

type TypewriterTextProps = {
  text: string
  startFrame?: number
  charsPerSecond?: number
  style?: React.CSSProperties
  cursorColor?: string
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  startFrame = 0,
  charsPerSecond = 20,
  style,
  cursorColor = '#22d3ee',
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const localFrame = Math.max(0, frame - startFrame)
  const framesPerChar = fps / charsPerSecond
  const charsVisible = Math.min(
    text.length,
    Math.floor(localFrame / framesPerChar)
  )

  const cursorOpacity = Math.round(localFrame / (fps / 2)) % 2 === 0 ? 1 : 0
  const showCursor = charsVisible < text.length

  return (
    <span style={style}>
      {text.slice(0, charsVisible)}
      {showCursor && (
        <span
          style={{
            opacity: cursorOpacity,
            color: cursorColor,
          }}
        >
          |
        </span>
      )}
    </span>
  )
}
