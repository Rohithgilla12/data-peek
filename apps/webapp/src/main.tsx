import './assets/global.css'

// Polyfill crypto.randomUUID for non-secure contexts (HTTP)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'undefined') {
  ;(crypto as any).randomUUID = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    )
  }
}

import { SocketTransport } from './socket'
import { createApi } from './api-shim'

// Initialize Socket.IO transport and create the API shim
// In production (same origin), use undefined so Socket.IO connects to the serving host.
// In dev, use VITE_SERVER_URL to point to the separate server process.
const serverUrl = import.meta.env.VITE_SERVER_URL || undefined
const transport = new SocketTransport(serverUrl)

// Assign to window.api — all stores/components use this
window.api = createApi(transport)

// Provide a stub for window.electron (used for platform detection in some components)
window.electron = {
  process: {
    platform: 'browser',
    versions: {}
  }
}

// Mount React
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
