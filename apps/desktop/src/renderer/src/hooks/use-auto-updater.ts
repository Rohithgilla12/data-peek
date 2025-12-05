import { useEffect, useRef } from 'react'
import { notify } from '@/stores/notification-store'

export function useAutoUpdater() {
  // Track if we've already shown the "update downloaded" notification
  // to avoid showing it multiple times
  const hasShownDownloadedRef = useRef(false)

  useEffect(() => {
    // Listen for update available event
    const unsubUpdateAvailable = window.api.updater.onUpdateAvailable((version) => {
      notify.info('Update Available', `Version ${version} is being downloaded...`)
    })

    // Listen for download progress (optional - you can show progress if needed)
    // const unsubProgress = window.api.updater.onDownloadProgress((percent) => {
    //   console.log(`Download progress: ${percent.toFixed(1)}%`)
    // })

    // Listen for update downloaded event
    const unsubUpdateDownloaded = window.api.updater.onUpdateDownloaded((version) => {
      // Only show once per session
      if (hasShownDownloadedRef.current) return
      hasShownDownloadedRef.current = true

      notify.success('Update Ready', `Version ${version} has been downloaded. Restart to update.`, {
        duration: 0, // Persistent until dismissed
        action: {
          label: 'Restart Now',
          variant: 'primary',
          onClick: () => {
            window.api.updater.quitAndInstall()
          }
        }
      })
    })

    // Listen for update errors (silent - just log)
    const unsubError = window.api.updater.onError((message) => {
      console.error('[auto-updater] Error:', message)
    })

    // Cleanup listeners on unmount
    return () => {
      unsubUpdateAvailable()
      unsubUpdateDownloaded()
      unsubError()
    }
  }, [])
}
