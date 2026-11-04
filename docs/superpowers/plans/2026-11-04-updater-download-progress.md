# Auto-Updater Download Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display real-time download progress with a progress bar and percentage inside a persistent notification toast during desktop application updates.

**Architecture:** Extend the existing renderer Zustand `notification-store` to support mutable notifications and an optional `progress` value (0-100). Enhance the `Notifications` UI component with `@data-peek/ui`'s `Progress` bar and wire `useAutoUpdater` to `window.api.updater.onDownloadProgress` with ~100ms throttling.

**Tech Stack:** Electron 34, React 19, TypeScript 5.8, Zustand, Tailwind CSS, `@data-peek/ui`, Vitest.

## Global Constraints

- Must use existing `@data-peek/ui` `Progress` component and Tailwind design system.
- Notification ID mutation must be atomic and preserve active properties.
- Progress updates from IPC must be throttled to prevent UI jank / excessive React re-renders.
- Must cleanly transition in-place from downloading to "Update Ready" upon completion.

---

### Task 1: Extend Notification Store with Progress and `updateNotification`

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/notification-store.ts:1-65`
- Create: `apps/desktop/src/renderer/src/stores/__tests__/notification-store.test.ts`

**Interfaces:**
- Consumes: None (base store)
- Produces:
  ```ts
  export interface Notification {
    id: string
    type: NotificationType
    title: string
    message?: string
    duration?: number
    dismissible?: boolean
    action?: NotificationAction
    progress?: number
  }

  interface NotificationState {
    notifications: Notification[]
    addNotification: (notification: Omit<Notification, 'id'>) => string
    updateNotification: (id: string, updates: Partial<Omit<Notification, 'id'>>) => void
    removeNotification: (id: string) => void
    clearAll: () => void
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/src/stores/__tests__/notification-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotificationStore } from '../notification-store'

describe('notification-store', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll()
    vi.useRealTimers()
  })

  it('adds a notification with initial progress and duration 0', () => {
    const id = useNotificationStore.getState().addNotification({
      type: 'info',
      title: 'Downloading',
      message: 'Downloading update...',
      duration: 0,
      progress: 0,
      dismissible: false
    })

    const notifications = useNotificationStore.getState().notifications
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      id,
      type: 'info',
      title: 'Downloading',
      progress: 0,
      duration: 0,
      dismissible: false
    })
  })

  it('updates notification progress and message in-place', () => {
    const id = useNotificationStore.getState().addNotification({
      type: 'info',
      title: 'Downloading',
      duration: 0,
      progress: 10
    })

    useNotificationStore.getState().updateNotification(id, {
      progress: 45,
      message: 'Downloading... 45%'
    })

    const notification = useNotificationStore.getState().notifications.find((n) => n.id === id)
    expect(notification).toBeDefined()
    expect(notification?.progress).toBe(45)
    expect(notification?.message).toBe('Downloading... 45%')
    expect(notification?.title).toBe('Downloading')
  })

  it('transitions notification to success and removes progress', () => {
    const id = useNotificationStore.getState().addNotification({
      type: 'info',
      title: 'Downloading',
      duration: 0,
      progress: 99
    })

    useNotificationStore.getState().updateNotification(id, {
      type: 'success',
      title: 'Update Ready',
      message: 'Version 0.37.0 downloaded',
      progress: undefined,
      dismissible: true
    })

    const notification = useNotificationStore.getState().notifications.find((n) => n.id === id)
    expect(notification?.type).toBe('success')
    expect(notification?.title).toBe('Update Ready')
    expect(notification?.progress).toBeUndefined()
    expect(notification?.dismissible).toBe(true)
  })

  it('safely ignores updates for non-existent IDs', () => {
    useNotificationStore.getState().updateNotification('non-existent', {
      progress: 50
    })
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/stores/__tests__/notification-store.test.ts`
Expected: FAIL with `updateNotification is not a function`

- [ ] **Step 3: Implement `progress` and `updateNotification` in `notification-store.ts`**

In `apps/desktop/src/renderer/src/stores/notification-store.ts`:
Update the `Notification` interface and `NotificationState` interface:
```ts
export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // ms, undefined or 0 = persistent until dismissed
  dismissible?: boolean
  action?: NotificationAction
  progress?: number
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => string
  updateNotification: (id: string, updates: Partial<Omit<Notification, 'id'>>) => void
  removeNotification: (id: string) => void
  clearAll: () => void
}
```

Implement `updateNotification` in `useNotificationStore`:
```ts
  updateNotification: (id, updates) => {
    set((state) => {
      const index = state.notifications.findIndex((n) => n.id === id)
      if (index === -1) return state

      const existing = state.notifications[index]
      const updated: Notification = {
        ...existing,
        ...updates
      }

      const nextNotifications = [...state.notifications]
      nextNotifications[index] = updated

      // If duration was added/updated to a positive number, schedule auto-dismiss
      if (updates.duration && updates.duration > 0 && (!existing.duration || existing.duration <= 0)) {
        setTimeout(() => {
          get().removeNotification(id)
        }, updates.duration)
      }

      return { notifications: nextNotifications }
    })
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/stores/__tests__/notification-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/notification-store.ts apps/desktop/src/renderer/src/stores/__tests__/notification-store.test.ts
git commit -m "feat(desktop): add progress support and updateNotification to notification store"
```

---

### Task 2: Render Progress Bar in Notifications UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/notifications.tsx:1-85`

**Interfaces:**
- Consumes:
  - `useNotificationStore` from `@/stores/notification-store`
  - `Progress` from `@data-peek/ui`
- Produces: Visual progress bar and percentage label rendered inside notification card

- [ ] **Step 1: Update `Notifications` component to render `Progress`**

In `apps/desktop/src/renderer/src/components/notifications.tsx`:
Import `Progress` from `@data-peek/ui`:
```tsx
import { useNotificationStore, type NotificationType } from '@/stores/notification-store'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn, Progress } from '@data-peek/ui'
```

Add the progress bar rendering in the message block under `{notification.message && ...}`:
```tsx
              {notification.message && (
                <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
              )}
              {notification.progress !== undefined && (
                <div className="mt-2.5 flex items-center gap-2">
                  <Progress value={notification.progress} className="h-1.5 flex-1" />
                  <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">
                    {notification.progress}%
                  </span>
                </div>
              )}
```

- [ ] **Step 2: Typecheck and lint check**

Run: `pnpm --filter @data-peek/desktop typecheck`
Expected: PASS with 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/notifications.tsx
git commit -m "feat(desktop): render progress bar in notification cards"
```

---

### Task 3: Wire Live Progress & Throttling into `useAutoUpdater`

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/use-auto-updater.ts:1-50`

**Interfaces:**
- Consumes:
  - `window.api.updater.onUpdateAvailable((version: string) => void)`
  - `window.api.updater.onDownloadProgress((percent: number) => void)`
  - `window.api.updater.onUpdateDownloaded((version: string) => void)`
  - `window.api.updater.onError((message: string) => void)`
  - `window.api.updater.quitAndInstall()`
  - `useNotificationStore.getState().addNotification`
  - `useNotificationStore.getState().updateNotification`
- Produces: Live throttled updater notification flow

- [ ] **Step 1: Implement live progress handling and in-place transitions**

In `apps/desktop/src/renderer/src/hooks/use-auto-updater.ts`:
Replace with:
```ts
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
      if (activeId) {
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
        notify.success('Update Ready', `Version ${version} has been downloaded. Restart to update.`, {
          duration: 0,
          action: {
            label: 'Restart Now',
            variant: 'primary',
            onClick: () => {
              window.api.updater.quitAndInstall()
            }
          }
        })
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck`
Expected: PASS with 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/use-auto-updater.ts
git commit -m "feat(desktop): report download progress live in updater notification"
```

---

### Task 4: Full Suite Verification & Build Validation

**Files:**
- Test all unit tests: `pnpm --filter @data-peek/desktop test`
- Typecheck: `pnpm --filter @data-peek/desktop typecheck`

- [ ] **Step 1: Run store unit tests**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/stores/__tests__/notification-store.test.ts`
Expected: PASS

- [ ] **Step 2: Run full typecheck across node and web targets**

Run: `pnpm --filter @data-peek/desktop typecheck`
Expected: PASS

- [ ] **Step 3: Run full vitest suite**

Run: `pnpm --filter @data-peek/desktop test`
Expected: All tests PASS
