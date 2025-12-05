'use client'

import { useNotificationStore, type NotificationType } from '@/stores/notification-store'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap: Record<NotificationType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle
}

const styleMap: Record<NotificationType, string> = {
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
  warning: 'border-yellow-500/30 bg-yellow-500/10'
}

const iconStyleMap: Record<NotificationType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-yellow-500'
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
                <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
              )}
              {notification.action && (
                <button
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
                onClick={() => removeNotification(notification.id)}
                className="shrink-0 p-0.5 hover:bg-accent rounded transition-colors"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
