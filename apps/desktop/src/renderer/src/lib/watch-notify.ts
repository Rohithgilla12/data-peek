/**
 * OS notification side-effect for fired watch alerts. Electron's renderer
 * supports the HTML5 Notification API without a permission prompt; the guard
 * exists for the vitest/node environment where Notification is undefined.
 */

import type { WatchAlert, WatchSnapshot } from './watch-types'
import { describeAlertCondition } from './watch-alerts'

export interface WatchAlertNotification {
  alert: WatchAlert
  snapshot: WatchSnapshot
  tabTitle?: string
}

export function notifyWatchAlert({ alert, snapshot, tabTitle }: WatchAlertNotification): void {
  if (typeof Notification === 'undefined') return
  const title = `Watch alert — ${tabTitle ?? 'query tab'}`
  const detail = snapshot.error
    ? snapshot.error
    : `${snapshot.rowCount} row${snapshot.rowCount === 1 ? '' : 's'} at tick ${snapshot.tick}`
  try {
    new Notification(title, {
      body: `${describeAlertCondition(alert.condition)} · ${detail}`,
      silent: false,
      tag: alert.id
    })
  } catch {
    // Notification construction can throw if the OS denies it — an alert
    // that fails to notify still shows its fired count in the popover.
  }
}
