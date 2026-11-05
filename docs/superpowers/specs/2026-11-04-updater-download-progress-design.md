# Auto-Updater Download Progress Design

## Overview
When an application update is detected and being downloaded in Data Peek, users currently only receive an initial text notification ("Version X is being downloaded...") which auto-dismisses after 5 seconds, followed by a completion notification when the download finishes.

This design introduces real-time visual download progress into the notification toast system, updating continuously with a progress bar and percentage indicator, and seamlessly morphing into the "Update Ready" notification upon completion.

## Architecture & Data Flow

```
[ Electron Main Process: autoUpdater ]
                 |
                 | 'download-progress' ({ percent })
                 v
   [ IPC: 'updater:download-progress' ]
                 |
                 v
[ Preload API: window.api.updater.onDownloadProgress ]
                 |
                 v
[ Renderer Hook: useAutoUpdater ]
                 |
                 | Throttled updates (~100ms)
                 v
[ Zustand Store: useNotificationStore.updateNotification ]
                 |
                 v
[ Component: Notifications (<Progress value={progress} />) ]
```

## Detailed Technical Specifications

### 1. Notification Store (`apps/desktop/src/renderer/src/stores/notification-store.ts`)
- **Extend `Notification` model**:
  ```ts
  export interface Notification {
    id: string
    type: NotificationType
    title: string
    message?: string
    duration?: number // ms, undefined or 0 = persistent until dismissed
    dismissible?: boolean
    action?: NotificationAction
    progress?: number // Integer 0 - 100 percentage
  }
  ```
- **Add `updateNotification` method**:
  ```ts
  updateNotification: (id: string, updates: Partial<Omit<Notification, 'id'>>) => void
  ```
- **Implementation logic**:
  - Finds the notification by `id`.
  - Merges `updates` into the existing notification object.
  - If `updates.duration` is provided and > 0, set up auto-dismiss timer.
  - If notification is not found, no-op safely.

### 2. Auto-Updater Hook (`apps/desktop/src/renderer/src/hooks/use-auto-updater.ts`)
- **Lifecycle tracking**:
  - `activeNotificationIdRef = useRef<string | null>(null)` tracks the notification created for the current update cycle.
  - `lastProgressUpdateRef = useRef<number>(0)` tracks the timestamp of the last UI update to throttle rapid IPC bursts to ~100ms intervals.
- **Event Handlers**:
  1. `onUpdateAvailable(version)`:
     - Spawns a persistent notification:
       - `title`: `'Downloading Update'`
       - `message`: `'Version ' + version + ' is downloading...'`
       - `duration`: `0` (persistent)
       - `dismissible`: `false`
       - `progress`: `0`
     - Stores the returned ID into `activeNotificationIdRef.current`.
  2. `onDownloadProgress(percent)`:
     - Clamps and rounds `percent`: `const rounded = Math.min(Math.max(Math.round(percent), 0), 100)`.
     - Throttles: only calls `updateNotification` if >= 100ms has elapsed since last update or `rounded === 100`.
     - Updates:
       - `progress`: `rounded`
       - `message`: `Downloading... ${rounded}%`
  3. `onUpdateDownloaded(version)`:
     - Clears the download progress state.
     - If `activeNotificationIdRef.current` exists, updates in-place:
       - `type`: `'success'`
       - `title`: `'Update Ready'`
       - `message`: `'Version ' + version + ' has been downloaded. Restart to update.'`
       - `progress`: `undefined`
       - `dismissible`: `true`
       - `action`: `{ label: 'Restart Now', variant: 'primary', onClick: () => window.api.updater.quitAndInstall() }`
     - If no active notification ID exists, calls `notify.success` as fallback.
  4. `onError(message)`:
     - If `activeNotificationIdRef.current` exists, updates to `type: 'error'`, removes `progress`, sets `dismissible: true`, and shows error info.

### 3. Notification UI Component (`apps/desktop/src/renderer/src/components/notifications.tsx`)
- Import `Progress` from `@data-peek/ui`.
- In the notification card body:
  - If `notification.progress !== undefined`:
    - Render a flex container with:
      - `<Progress value={notification.progress} className="h-1.5 flex-1" />`
      - `<span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">{notification.progress}%</span>`

## Testing & Verification
- Unit test for `notification-store`: verify `updateNotification` correctly modifies existing notification, handles `progress`, and sets timers if duration is added.
- Verify component render of `Notifications` when `progress` is provided.
- Typecheck verification: `pnpm run typecheck`.
- Unit tests: `pnpm test`.
