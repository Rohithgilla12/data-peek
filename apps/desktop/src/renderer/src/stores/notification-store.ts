import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // ms, undefined = persistent until dismissed
  dismissible?: boolean
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => string
  removeNotification: (id: string) => void
  clearAll: () => void
}

let notificationId = 0

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`
    const newNotification: Notification = {
      ...notification,
      id,
      dismissible: notification.dismissible ?? true,
      duration: notification.duration ?? 5000 // Default 5 seconds
    }

    set((state) => ({
      notifications: [...state.notifications, newNotification]
    }))

    // Auto-dismiss after duration (if set)
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id)
      }, newNotification.duration)
    }

    return id
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }))
  },

  clearAll: () => {
    set({ notifications: [] })
  }
}))

// Helper functions for common notification types
export const notify = {
  success: (title: string, message?: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'success', title, message, duration }),

  error: (title: string, message?: string, duration?: number) =>
    useNotificationStore.getState().addNotification({
      type: 'error',
      title,
      message,
      duration: duration ?? 8000 // Errors stay longer
    }),

  info: (title: string, message?: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'info', title, message, duration }),

  warning: (title: string, message?: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'warning', title, message, duration })
}
