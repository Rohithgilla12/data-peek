/// <reference types="vite/client" />

import type { Api } from './api-shim'

declare global {
  interface Window {
    api: Api
    electron?: {
      process: {
        platform: string
        versions: Record<string, string>
      }
    }
  }
}
