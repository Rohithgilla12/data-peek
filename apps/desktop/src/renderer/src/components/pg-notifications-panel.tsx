import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  BellOff,
  Copy,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { Button, Input, Textarea, Badge, ScrollArea, Collapsible, CollapsibleContent, CollapsibleTrigger, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@data-peek/ui'

import {
  useTabStore,
  useConnectionStore,
  usePgNotificationStore,
  initPgNotificationListener
} from '@/stores'
import type { PgNotificationsTab } from '@/stores/tab-store'
import type { PgNotificationEvent } from '@data-peek/shared'
import { PgNotificationStatusStrip } from './pg-notification-status-strip'

interface Props {
  tabId: string
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  return (
    d.toLocaleTimeString(undefined, { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  )
}

function tryPrettyJson(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

function EventRow({ event, isFresh }: { event: PgNotificationEvent; isFresh: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const pretty = tryPrettyJson(event.payload)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(event.payload)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        'relative border-b border-border/50 last:border-0 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors',
        isFresh && 'motion-safe:animate-[pgnotify-flash_600ms_ease-out]'
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      {isFresh && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-emerald-500/80 motion-safe:animate-[pgnotify-bar_700ms_ease-out_forwards]"
        />
      )}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground shrink-0 font-mono">
          {formatTimestamp(event.receivedAt)}
        </span>
        <Badge variant="secondary" className="text-xs shrink-0">
          {event.channel}
        </Badge>
        {!expanded && (
          <span className="text-xs text-foreground/80 truncate flex-1 font-mono">
            {event.payload || <span className="text-muted-foreground italic">empty</span>}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 ml-auto"
          onClick={handleCopy}
          title="Copy payload"
        >
          {copied ? (
            <span className="text-[10px] text-green-500">ok</span>
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 ml-0">
          {pretty ? (
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all overflow-x-auto max-h-48">
              {pretty}
            </pre>
          ) : (
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-48">
              {event.payload || <span className="text-muted-foreground italic">empty payload</span>}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function PgNotificationsPanel({ tabId }: Props) {
  const tab = useTabStore((s) => s.getTab(tabId)) as PgNotificationsTab | undefined
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === tab?.connectionId)
  )

  const channels = usePgNotificationStore((s) => s.channels)
  const events = usePgNotificationStore((s) => s.events)
  const filter = usePgNotificationStore((s) => s.filter)
  const subscribe = usePgNotificationStore((s) => s.subscribe)
  const unsubscribe = usePgNotificationStore((s) => s.unsubscribe)
  const sendNotification = usePgNotificationStore((s) => s.sendNotification)
  const loadHistory = usePgNotificationStore((s) => s.loadHistory)
  const clearHistory = usePgNotificationStore((s) => s.clearHistory)
  const setFilter = usePgNotificationStore((s) => s.setFilter)
  const clearEvents = usePgNotificationStore((s) => s.clearEvents)

  const [channelInput, setChannelInput] = useState('')
  const [sendChannel, setSendChannel] = useState('')
  const [sendPayload, setSendPayload] = useState('')
  const [isSendOpen, setIsSendOpen] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const mountedAtRef = useRef<number>(Date.now())

  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    const cleanup = initPgNotificationListener()
    return cleanup
  }, [])

  useEffect(() => {
    if (tab?.connectionId) {
      loadHistory(tab.connectionId)
    }
  }, [tab?.connectionId, loadHistory])

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [events.length])

  const activeChannels = Array.from(channels.values()).filter((c) => c.isListening)

  const filteredEvents = events.filter((e) => {
    if (filter.channel && e.channel !== filter.channel) return false
    if (filter.search && !e.payload.toLowerCase().includes(filter.search.toLowerCase()))
      return false
    return true
  })

  const handleSubscribe = useCallback(async () => {
    const ch = channelInput.trim()
    if (!ch || !activeConnection || !tab?.connectionId) return

    setIsSubscribing(true)
    setSubscribeError(null)
    try {
      await subscribe(tab.connectionId, activeConnection, ch)
      setChannelInput('')
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : 'Failed to subscribe')
    } finally {
      setIsSubscribing(false)
    }
  }, [channelInput, activeConnection, tab?.connectionId, subscribe])

  const handleUnsubscribe = useCallback(
    async (channel: string) => {
      if (!tab?.connectionId) return
      try {
        await unsubscribe(tab.connectionId, channel)
      } catch {
        // ignore unsubscribe errors
      }
    },
    [tab?.connectionId, unsubscribe]
  )

  const handleSend = useCallback(async () => {
    if (!sendChannel || !activeConnection || !tab?.connectionId) return

    setIsSending(true)
    setSendError(null)
    try {
      await sendNotification(activeConnection, sendChannel, sendPayload)
      setSendPayload('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setIsSending(false)
    }
  }, [sendChannel, sendPayload, activeConnection, sendNotification])

  const handleClearAll = useCallback(async () => {
    clearEvents()
    if (tab?.connectionId) {
      await clearHistory(tab.connectionId).catch(() => {})
    }
  }, [tab?.connectionId, clearHistory, clearEvents])

  if (!activeConnection || activeConnection.dbType !== 'postgresql') {
    return (
      <div className="flex flex-1 items-center justify-center text-center p-8">
        <div className="space-y-2">
          <AlertCircle className="size-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">PostgreSQL only</p>
          <p className="text-xs text-muted-foreground">
            LISTEN/NOTIFY is a PostgreSQL feature. Connect to a PostgreSQL database to use this
            panel.
          </p>
        </div>
      </div>
    )
  }

  const hostLabel = `${activeConnection.host}${activeConnection.database ? '/' + activeConnection.database : ''}`

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      {tab?.connectionId && (
        <PgNotificationStatusStrip
          connectionId={tab.connectionId}
          hostLabel={hostLabel}
          channelCount={activeChannels.length}
        />
      )}
      <div className="flex flex-col gap-3 p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Channel name..."
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubscribe()
              }}
              className="h-8 text-sm font-mono"
            />
            <Button
              size="sm"
              onClick={handleSubscribe}
              disabled={!channelInput.trim() || isSubscribing}
              className="h-8 shrink-0"
            >
              {isSubscribing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Bell className="size-3 mr-1" />
              )}
              Listen
            </Button>
          </div>
        </div>

        {subscribeError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="size-3" />
            {subscribeError}
          </p>
        )}

        {activeChannels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeChannels.map((ch) => (
              <Badge
                key={ch.name}
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-0.5 text-xs font-mono cursor-default"
              >
                {ch.name}
                {ch.eventCount > 0 && (
                  <span className="text-muted-foreground text-[10px]">({ch.eventCount})</span>
                )}
                <button
                  onClick={() => handleUnsubscribe(ch.name)}
                  className="ml-0.5 hover:text-destructive transition-colors"
                  title="Unsubscribe"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0 bg-muted/20">
        <Select
          value={filter.channel || 'all'}
          onValueChange={(v) => setFilter({ channel: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="h-6 text-xs w-36">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {activeChannels.map((ch) => (
              <SelectItem key={ch.name} value={ch.name}>
                {ch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search payloads..."
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          className="h-6 text-xs flex-1"
        />
        <span className="text-xs text-muted-foreground shrink-0">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={handleClearAll}
          title="Clear all events"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className="text-sm">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <BellOff className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {activeChannels.length === 0
                  ? 'Subscribe to a channel to start receiving notifications'
                  : 'Waiting for notifications...'}
              </p>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                isFresh={event.receivedAt > mountedAtRef.current && Date.now() - event.receivedAt < 1500}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border shrink-0">
        <Collapsible open={isSendOpen} onOpenChange={setIsSendOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
              <Send className="size-3" />
              <span>Send notification</span>
              {isSendOpen ? (
                <ChevronDown className="size-3 ml-auto" />
              ) : (
                <ChevronUp className="size-3 ml-auto" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 flex flex-col gap-2">
              <Select value={sendChannel} onValueChange={setSendChannel}>
                <SelectTrigger
                  className={cn('h-8 text-sm', !sendChannel && 'text-muted-foreground')}
                >
                  <SelectValue placeholder="Select channel..." />
                </SelectTrigger>
                <SelectContent>
                  {activeChannels.map((ch) => (
                    <SelectItem key={ch.name} value={ch.name}>
                      {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Payload (optional, use JSON for structured data)..."
                value={sendPayload}
                onChange={(e) => setSendPayload(e.target.value)}
                className="text-xs font-mono resize-none"
                rows={3}
              />
              {sendError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {sendError}
                </p>
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!sendChannel || isSending}
                className="self-end"
              >
                {isSending ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Send className="size-3 mr-1" />
                )}
                Send
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
