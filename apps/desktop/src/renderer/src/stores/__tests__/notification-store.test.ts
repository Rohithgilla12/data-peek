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

  it('schedules auto-dismiss when duration is updated from 0 to a positive value', () => {
    vi.useFakeTimers()
    const id = useNotificationStore.getState().addNotification({
      type: 'info',
      title: 'Downloading',
      duration: 0
    })

    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    useNotificationStore.getState().updateNotification(id, {
      duration: 3000
    })

    vi.advanceTimersByTime(2999)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
