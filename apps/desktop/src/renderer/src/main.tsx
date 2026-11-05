import './assets/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router, RootErrorBoundary } from './router'
import { IconContext } from '@/components/icons'

// Phosphor does not set aria-hidden (lucide did); icons are decorative unless given a label.
const ICON_CONTEXT_VALUE = { 'aria-hidden': true } as const

// Disable browser-like behaviors for native app feel
;(() => {
  document.documentElement.dataset.platform = window.electron.process.platform

  // Prevent file drag/drop from navigating away
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => e.preventDefault())

  // Disable pinch-to-zoom (can feel jarring in desktop apps)
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    },
    { passive: false }
  )
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={ICON_CONTEXT_VALUE}>
      <RootErrorBoundary>
        <RouterProvider router={router} />
      </RootErrorBoundary>
    </IconContext.Provider>
  </StrictMode>
)
