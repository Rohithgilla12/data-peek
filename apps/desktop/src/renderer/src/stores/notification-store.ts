import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'primary'
}

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
      if (
        updates.duration &&
        updates.duration > 0 &&
        (!existing.duration || existing.duration <= 0)
      ) {
        setTimeout(() => {
          get().removeNotification(id)
        }, updates.duration)
      }

      return { notifications: nextNotifications }
    })
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
  success: (
    title: string,
    message?: string,
    options?: { duration?: number; action?: NotificationAction }
  ) =>
    useNotificationStore.getState().addNotification({
      type: 'success',
      title,
      message,
      duration: options?.duration,
      action: options?.action
    }),

  error: (
    title: string,
    message?: string,
    options?: { duration?: number; action?: NotificationAction }
  ) =>
    useNotificationStore.getState().addNotification({
      type: 'error',
      title,
      message,
      duration: options?.duration ?? 8000, // Errors stay longer
      action: options?.action
    }),

  info: (
    title: string,
    message?: string,
    options?: { duration?: number; action?: NotificationAction }
  ) =>
    useNotificationStore.getState().addNotification({
      type: 'info',
      title,
      message,
      duration: options?.duration,
      action: options?.action
    }),

  warning: (
    title: string,
    message?: string,
    options?: { duration?: number; action?: NotificationAction }
  ) =>
    useNotificationStore.getState().addNotification({
      type: 'warning',
      title,
      message,
      duration: options?.duration,
      action: options?.action
    })
}
