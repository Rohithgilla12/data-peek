import { create } from 'zustand'
import type {
  PgNotificationEvent,
  PgNotificationChannel,
  PgNotificationStats,
  ConnectionConfig
} from '@shared/index'

const MAX_EVENTS_IN_MEMORY = 1000
const STATS_WINDOW_MS = 60_000

interface EventTimestamp {
  time: number
  payloadSize: number
}

interface PgNotificationFilter {
  channel: string
  search: string
}

interface PgNotificationState {
  channels: Map<string, PgNotificationChannel>
  events: PgNotificationEvent[]
  stats: PgNotificationStats
  isConnected: boolean
  filter: PgNotificationFilter

  recentTimestamps: EventTimestamp[]

  subscribe: (connectionId: string, config: ConnectionConfig, channel: string) => Promise<void>
  unsubscribe: (connectionId: string, channel: string) => Promise<void>
  sendNotification: (config: ConnectionConfig, channel: string, payload: string) => Promise<void>
  loadHistory: (connectionId: string, limit?: number) => Promise<void>
  clearHistory: (connectionId: string) => Promise<void>
  setFilter: (filter: Partial<PgNotificationFilter>) => void
  clearEvents: () => void
  pushEvent: (event: PgNotificationEvent) => void
  refreshChannels: (connectionId: string) => Promise<void>
}

function computeStats(
  recentTimestamps: EventTimestamp[],
  totalEvents: number
): PgNotificationStats {
  const now = Date.now()
  const windowStart = now - STATS_WINDOW_MS
  const windowEvents = recentTimestamps.filter((t) => t.time >= windowStart)

  const eventsPerSecond =
    windowEvents.length > 0 ? windowEvents.length / (STATS_WINDOW_MS / 1000) : 0

  const avgPayloadSize =
    windowEvents.length > 0
      ? windowEvents.reduce((sum, t) => sum + t.payloadSize, 0) / windowEvents.length
      : 0

  return {
    eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
    totalEvents,
    avgPayloadSize: Math.round(avgPayloadSize)
  }
}

export const usePgNotificationStore = create<PgNotificationState>((set) => ({
  channels: new Map(),
  events: [],
  stats: { eventsPerSecond: 0, totalEvents: 0, avgPayloadSize: 0 },
  isConnected: false,
  filter: { channel: '', search: '' },
  recentTimestamps: [],

  subscribe: async (connectionId, config, channel) => {
    const response = await window.api.pgNotify.subscribe(connectionId, config, channel)
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to subscribe')
    }

    set((state) => {
      const channels = new Map(state.channels)
      if (!channels.has(channel)) {
        channels.set(channel, {
          name: channel,
          isListening: true,
          eventCount: 0
        })
      } else {
        const existing = channels.get(channel)!
        channels.set(channel, { ...existing, isListening: true })
      }
      return { channels, isConnected: true }
    })
  },

  unsubscribe: async (connectionId, channel) => {
    const response = await window.api.pgNotify.unsubscribe(connectionId, channel)
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to unsubscribe')
    }

    set((state) => {
      const channels = new Map(state.channels)
      channels.delete(channel)
      return { channels }
    })
  },

  sendNotification: async (config, channel, payload) => {
    const response = await window.api.pgNotify.send(config, channel, payload)
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to send notification')
    }
  },

  loadHistory: async (connectionId, limit) => {
    const response = await window.api.pgNotify.getHistory(connectionId, limit)
    if (response.success && response.data) {
      const events = [...response.data].reverse()
      set((state) => {
        const merged = [...events, ...state.events]
        const seen = new Set<string>()
        const deduped = merged.filter((e) => {
          if (seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })
        deduped.sort((a, b) => a.receivedAt - b.receivedAt)
        return { events: deduped.slice(-MAX_EVENTS_IN_MEMORY) }
      })
    }
  },

  clearHistory: async (connectionId) => {
    const response = await window.api.pgNotify.clearHistory(connectionId)
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to clear history')
    }
    set({ events: [] })
  },

  setFilter: (filter) => {
    set((state) => ({ filter: { ...state.filter, ...filter } }))
  },

  clearEvents: () => {
    set({ events: [], recentTimestamps: [] })
  },

  pushEvent: (event) => {
    set((state) => {
      const events = [...state.events, event].slice(-MAX_EVENTS_IN_MEMORY)

      const now = Date.now()
      const windowStart = now - STATS_WINDOW_MS
      const recentTimestamps = [
        ...state.recentTimestamps.filter((t) => t.time >= windowStart),
        { time: now, payloadSize: event.payload.length }
      ]

      const channels = new Map(state.channels)
      const existing = channels.get(event.channel)
      channels.set(event.channel, {
        name: event.channel,
        isListening: existing?.isListening ?? false,
        eventCount: (existing?.eventCount ?? 0) + 1,
        lastEventAt: now
      })

      const stats = computeStats(recentTimestamps, events.length)

      return { events, recentTimestamps, channels, stats }
    })
  },

  refreshChannels: async (connectionId) => {
    const response = await window.api.pgNotify.getChannels(connectionId)
    if (response.success && response.data) {
      set((state) => {
        const channels = new Map(state.channels)
        for (const ch of response.data!) {
          channels.set(ch.name, ch)
        }
        return { channels }
      })
    }
  }
}))

let unsubscribeEventListener: (() => void) | null = null

export function initPgNotificationListener(): () => void {
  if (unsubscribeEventListener) {
    unsubscribeEventListener()
  }

  unsubscribeEventListener = window.api.pgNotify.onEvent((event) => {
    usePgNotificationStore.getState().pushEvent(event)
  })

  return () => {
    if (unsubscribeEventListener) {
      unsubscribeEventListener()
      unsubscribeEventListener = null
    }
  }
}
