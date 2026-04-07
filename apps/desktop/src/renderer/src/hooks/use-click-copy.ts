import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Discriminates single-click (copy) from double-click (action) using a
 * short delay. Single click copies the provided text; double click cancels
 * the pending copy and fires the `onDoubleClick` callback instead.
 */
export function useClickCopy({
  onDoubleClick,
  resetDelay = 1400,
  clickDelay = 250
}: {
  onDoubleClick?: () => void
  resetDelay?: number
  clickDelay?: number
} = {}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const handleClick = useCallback(
    (text: string) => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), resetDelay)
      }, clickDelay)
    },
    [resetDelay, clickDelay]
  )

  const handleDoubleClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    onDoubleClick?.()
  }, [onDoubleClick])

  return { copied, handleClick, handleDoubleClick }
}
