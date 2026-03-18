import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'execution-plan-width'
const DEFAULT_WIDTH = 500
const MIN_WIDTH = 300
const MAX_WIDTH = 800

interface UseExecutionPlanResizeReturn {
  executionPlanWidth: number
  setExecutionPlanWidth: React.Dispatch<React.SetStateAction<number>>
  startResizing: () => void
  isResizing: boolean
}

export function useExecutionPlanResize(): UseExecutionPlanResizeReturn {
  const [executionPlanWidth, setExecutionPlanWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH
  })

  const isResizingRef = useRef(false)
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - e.clientX))
    setExecutionPlanWidth(newWidth)
  }, [])

  const handleMouseUp = useCallback(() => {
    if (isResizingRef.current) {
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Save current width to localStorage
      setExecutionPlanWidth((currentWidth) => {
        localStorage.setItem(STORAGE_KEY, String(currentWidth))
        return currentWidth
      })
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const startResizing = useCallback(() => {
    isResizingRef.current = true
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return {
    executionPlanWidth,
    setExecutionPlanWidth,
    startResizing,
    isResizing
  }
}
