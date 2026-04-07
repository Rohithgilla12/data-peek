'use client'

import { scan } from 'react-scan'
import { useEffect } from 'react'

export function ReactScan() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      scan({
        enabled: true,
        log: true,
      })
    }
  }, [])

  return null
}
