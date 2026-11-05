import { useEffect, useRef } from 'react'
import { useNotificationStore, notify } from '@/stores/notification-store'

export function useAutoUpdater() {
  const hasShownDownloadedRef = useRef(false)
  const activeNotificationIdRef = useRef<string | null>(null)
  const lastProgressTimeRef = useRef<number>(0)

  useEffect(() => {
    // 1. Update available -> create persistent notification with 0% progress
    const unsubUpdateAvailable = window.api.updater.onUpdateAvailable((version) => {
      const id = useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Downloading Update',
        message: `Version ${version} is downloading...`,
        duration: 0,
        dismissible: false,
        progress: 0
      })
      activeNotificationIdRef.current = id
    })

    // 2. Download progress -> throttled update (~100ms or 100%)
    const unsubProgress = window.api.updater.onDownloadProgress((percent) => {
      const activeId = activeNotificationIdRef.current
      if (!activeId) return

      const now = Date.now()
      const roundedPercent = Math.min(Math.max(Math.round(percent), 0), 100)

      // Throttle updates unless complete
      if (now - lastProgressTimeRef.current < 100 && roundedPercent < 100) {
        return
      }
      lastProgressTimeRef.current = now

      useNotificationStore.getState().updateNotification(activeId, {
        progress: roundedPercent,
        message: `Downloading... ${roundedPercent}%`
      })
    })

    // 3. Update downloaded -> transition to success with Restart button
    const unsubUpdateDownloaded = window.api.updater.onUpdateDownloaded((version) => {
      if (hasShownDownloadedRef.current) return
      hasShownDownloadedRef.current = true

      const activeId = activeNotificationIdRef.current
      const existsInStore =
        activeId && useNotificationStore.getState().notifications.some((n) => n.id === activeId)

      if (activeId && existsInStore) {
        useNotificationStore.getState().updateNotification(activeId, {
          type: 'success',
          title: 'Update Ready',
          message: `Version ${version} has been downloaded. Restart to update.`,
          progress: undefined,
          dismissible: true,
          duration: 0,
          action: {
            label: 'Restart Now',
            variant: 'primary',
            onClick: () => {
              window.api.updater.quitAndInstall()
            }
          }
        })
      } else {
        notify.success(
          'Update Ready',
          `Version ${version} has been downloaded. Restart to update.`,
          {
            duration: 0,
            action: {
              label: 'Restart Now',
              variant: 'primary',
              onClick: () => {
                window.api.updater.quitAndInstall()
              }
            }
          }
        )
      }
    })

    // 4. Update error -> report and release active notification
    const unsubError = window.api.updater.onError((message) => {
      console.error('[auto-updater] Error:', message)
      const activeId = activeNotificationIdRef.current
      if (activeId) {
        useNotificationStore.getState().updateNotification(activeId, {
          type: 'error',
          title: 'Update Failed',
          message: 'An error occurred while downloading the update.',
          progress: undefined,
          dismissible: true,
          duration: 8000
        })
        activeNotificationIdRef.current = null
      }
    })

    return () => {
      unsubUpdateAvailable()
      unsubProgress()
      unsubUpdateDownloaded()
      unsubError()
    }
  }, [])
}
