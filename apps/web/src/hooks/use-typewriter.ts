'use client'

import { useEffect, useRef, useState } from 'react'

interface UseTypewriterOptions {
  text: string
  startDelay?: number
  onComplete?: () => void
}

export function useTypewriter({ text, startDelay = 0, onComplete }: UseTypewriterOptions) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    setDisplayedText('')
    setIsComplete(false)
    setIsStarted(false)

    if (prefersReducedMotion.current) {
      setDisplayedText(text)
      setIsComplete(true)
      setIsStarted(true)
      onComplete?.()
      return
    }

    const startTimer = setTimeout(() => {
      setIsStarted(true)
    }, startDelay)

    return () => clearTimeout(startTimer)
  }, [text, startDelay, onComplete])

  useEffect(() => {
    if (!isStarted || isComplete || prefersReducedMotion.current) return

    let index = 0
    let frameId: number
    let lastTime = 0
    let nextCharDelay = getCharDelay(text, 0)

    function getCharDelay(str: string, i: number): number {
      const char = str[i]
      if (char === ' ' && Math.random() > 0.7) return 120 + Math.random() * 80
      if (char === ',' || char === ';') return 100 + Math.random() * 60
      return 30 + Math.random() * 40
    }

    function tick(time: number) {
      if (!lastTime) lastTime = time

      if (time - lastTime >= nextCharDelay) {
        index++
        setDisplayedText(text.slice(0, index))
        lastTime = time

        if (index >= text.length) {
          setIsComplete(true)
          onComplete?.()
          return
        }

        nextCharDelay = getCharDelay(text, index)
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [text, isStarted, isComplete, onComplete])

  return { text: displayedText, isComplete, isStarted }
}
