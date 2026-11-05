import { useNotificationStore, type NotificationType } from '@/stores/notification-store'
import { CloseIcon, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '@/components/icons'
import { cn, Progress } from '@data-peek/ui'

const iconMap: Record<NotificationType, typeof SuccessIcon> = {
  success: SuccessIcon,
  error: ErrorIcon,
  info: InfoIcon,
  warning: WarningIcon
}

const styleMap: Record<NotificationType, string> = {
  success: 'border-success/30 bg-success/10',
  error: 'border-destructive/30 bg-destructive/10',
  info: 'border-primary/30 bg-primary/10',
  warning: 'border-warning/30 bg-warning/10'
}

const iconStyleMap: Record<NotificationType, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
  warning: 'text-warning'
}

export function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications)
  const removeNotification = useNotificationStore((s) => s.removeNotification)

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {notifications.map((notification) => {
        const Icon = iconMap[notification.type]

        return (
          <div
            key={notification.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
              'animate-in slide-in-from-right-5 fade-in duration-200',
              'bg-background/95',
              styleMap[notification.type]
            )}
          >
            <Icon className={cn('size-5 shrink-0 mt-0.5', iconStyleMap[notification.type])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{notification.title}</p>
              {notification.message && (
                <p className="font-sans text-xs text-muted-foreground mt-0.5">
                  {notification.message}
                </p>
              )}
              {notification.progress !== undefined && (
                <div className="mt-2.5 flex items-center gap-2">
                  <Progress value={notification.progress} className="h-1.5 flex-1" />
                  <span className="text-2xs font-mono text-muted-foreground w-8 text-right shrink-0">
                    {notification.progress}%
                  </span>
                </div>
              )}
              {notification.action && (
                <button
                  type="button"
                  onClick={() => {
                    notification.action?.onClick()
                    removeNotification(notification.id)
                  }}
                  className={cn(
                    'mt-2 text-xs font-medium px-3 py-1.5 rounded transition-colors',
                    notification.action.variant === 'primary'
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-accent hover:bg-accent/80 text-foreground'
                  )}
                >
                  {notification.action.label}
                </button>
              )}
            </div>
            {notification.dismissible && (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => removeNotification(notification.id)}
                className="shrink-0 p-0.5 hover:bg-accent rounded transition-colors"
              >
                <CloseIcon className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
