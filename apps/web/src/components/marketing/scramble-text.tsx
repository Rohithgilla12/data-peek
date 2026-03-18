'use client'

import { useCallback, useRef, useState } from 'react'

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'

export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(text)
  const isAnimating = useRef(false)

  const scramble = useCallback(() => {
    if (isAnimating.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    isAnimating.current = true
    let frame = 0
    const totalFrames = 6

    function tick() {
      frame++
      if (frame >= totalFrames) {
        setDisplay(text)
        isAnimating.current = false
        return
      }

      const progress = frame / totalFrames
      const resolved = Math.floor(progress * text.length)

      setDisplay(
        text
          .split('')
          .map((char, i) => {
            if (char === ' ') return ' '
            if (i < resolved) return text[i]
            return chars[Math.floor(Math.random() * chars.length)]
          })
          .join('')
      )

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [text])

  return (
    <span className={className} onMouseEnter={scramble}>
      {display}
    </span>
  )
}
