'use client'

import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const updateProgress = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const readProgress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      setProgress(Math.min(100, Math.max(0, readProgress)))
      setShowBackToTop(scrollTop > 500)
    }

    window.addEventListener('scroll', updateProgress)
    updateProgress()
    return () => window.removeEventListener('scroll', updateProgress)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-(--color-border-subtle)">
        <div
          className="h-full bg-gradient-to-r from-(--color-accent) to-(--color-accent-dim) transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-3 rounded-full bg-(--color-surface) border border-(--color-border) hover:border-(--color-accent)/50 hover:bg-(--color-surface-elevated) transition-all duration-300 shadow-lg animate-fade-in-up"
          aria-label="Back to top"
        >
          <ChevronUp className="w-5 h-5 text-(--color-accent)" />
        </button>
      )}
    </>
  )
}
