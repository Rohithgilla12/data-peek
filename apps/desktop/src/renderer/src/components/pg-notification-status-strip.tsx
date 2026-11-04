import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshIcon, SpinnerIcon } from '@/components/icons'
import { cn } from '@data-peek/ui'
import type { PgNotificationConnectionStatus } from '@data-peek/shared'
import { usePgNotificationStore } from '@/stores'

interface Props {
  connectionId: string
  hostLabel: string
  channelCount: number
}

function formatUptime(fromMs?: number): string {
  if (!fromMs) return '00:00:00'
  const seconds = Math.max(0, Math.floor((Date.now() - fromMs) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatCountdown(targetMs?: number): string {
  if (!targetMs) return ''
  const remaining = Math.max(0, targetMs - Date.now())
  const seconds = Math.ceil(remaining / 1000)
  return `${seconds}s`
}

type Tone = 'ok' | 'warn' | 'err' | 'idle'

function stateToTone(state?: PgNotificationConnectionStatus['state']): Tone {
  switch (state) {
    case 'connected':
      return 'ok'
    case 'connecting':
    case 'reconnecting':
      return 'warn'
    case 'error':
    case 'disconnected':
      return 'err'
    default:
      return 'idle'
  }
}

function toneClasses(tone: Tone): {
  dot: string
  text: string
  border: string
  glow: string
  bar: string
} {
  switch (tone) {
    case 'ok':
      return {
        dot: 'bg-success',
        text: 'text-success',
        border: 'border-success/30',
        glow: 'bg-success/10',
        bar: 'bg-success'
      }
    case 'warn':
      return {
        dot: 'bg-warning',
        text: 'text-warning',
        border: 'border-warning/30',
        glow: 'bg-warning/10',
        bar: 'bg-warning'
      }
    case 'err':
      return {
        dot: 'bg-destructive',
        text: 'text-destructive',
        border: 'border-destructive/30',
        glow: 'bg-destructive/10',
        bar: 'bg-destructive'
      }
    default:
      return {
        dot: 'bg-muted-foreground/50',
        text: 'text-muted-foreground',
        border: 'border-border',
        glow: 'bg-muted/20',
        bar: 'bg-muted-foreground/40'
      }
  }
}

function stateLabel(status?: PgNotificationConnectionStatus | null): string {
  if (!status) return 'idle'
  switch (status.state) {
    case 'connected':
      return 'alive'
    case 'connecting':
      return 'connecting'
    case 'reconnecting':
      return 'reconnecting'
    case 'disconnected':
      return 'disconnected'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

function Sparkline({
  samples,
  tone,
  width = 160,
  height = 28
}: {
  samples: number[]
  tone: Tone
  width?: number
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    const max = Math.max(1, ...samples)
    const n = samples.length
    if (n === 0) return

    const stepX = width / Math.max(1, n - 1)

    const toneColors: Record<Tone, { stroke: string; fill: string }> = {
      ok: { stroke: 'rgba(16, 185, 129, 0.95)', fill: 'rgba(16, 185, 129, 0.18)' },
      warn: { stroke: 'rgba(245, 158, 11, 0.95)', fill: 'rgba(245, 158, 11, 0.18)' },
      err: { stroke: 'rgba(244, 63, 94, 0.95)', fill: 'rgba(244, 63, 94, 0.18)' },
      idle: { stroke: 'rgba(148, 163, 184, 0.6)', fill: 'rgba(148, 163, 184, 0.12)' }
    }
    const colors = toneColors[tone]

    const points: Array<[number, number]> = samples.map((v, i) => {
      const x = i * stepX
      const y = height - 2 - (v / max) * (height - 4)
      return [x, y]
    })

    ctx.beginPath()
    ctx.moveTo(0, height)
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.lineTo(x, y)
      else {
        const [px, py] = points[i - 1]
        const cx = (px + x) / 2
        ctx.quadraticCurveTo(px, py, cx, (py + y) / 2)
      }
    })
    const last = points[points.length - 1]
    ctx.lineTo(last[0], height)
    ctx.closePath()
    ctx.fillStyle = colors.fill
    ctx.fill()

    ctx.beginPath()
    points.forEach(([x, y], i) => {
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        const [px, py] = points[i - 1]
        const cx = (px + x) / 2
        ctx.quadraticCurveTo(px, py, cx, (py + y) / 2)
      }
    })
    ctx.strokeStyle = colors.stroke
    ctx.lineWidth = 1.25
    ctx.lineJoin = 'round'
    ctx.stroke()

    // head dot
    const [hx, hy] = last
    ctx.beginPath()
    ctx.arc(hx, hy, 2, 0, Math.PI * 2)
    ctx.fillStyle = colors.stroke
    ctx.fill()
  }, [samples, tone, width, height])

  return (
    <canvas ref={canvasRef} style={{ width, height }} className="shrink-0" aria-hidden="true" />
  )
}

const SPARK_BUCKETS = 30
const SPARK_WINDOW_MS = 30_000

export function PgNotificationStatusStrip({ connectionId, hostLabel, channelCount }: Props) {
  const status = usePgNotificationStore((s) => s.statuses[connectionId])
  const reconnect = usePgNotificationStore((s) => s.reconnect)
  const events = usePgNotificationStore((s) => s.events)
  const stats = usePgNotificationStore((s) => s.stats)

  const [now, setNow] = useState(() => Date.now())
  const [isManualReconnecting, setIsManualReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const samples = useMemo(() => {
    const buckets = new Array<number>(SPARK_BUCKETS).fill(0)
    const windowStart = now - SPARK_WINDOW_MS
    const bucketMs = SPARK_WINDOW_MS / SPARK_BUCKETS
    for (const ev of events) {
      if (ev.receivedAt < windowStart) continue
      const idx = Math.min(
        SPARK_BUCKETS - 1,
        Math.max(0, Math.floor((ev.receivedAt - windowStart) / bucketMs))
      )
      buckets[idx]++
    }
    return buckets
  }, [events, now])

  const tone = stateToTone(status?.state)
  const t = toneClasses(tone)
  const label = stateLabel(status)

  const connected = status?.state === 'connected'
  const reconnecting = status?.state === 'reconnecting' || status?.state === 'connecting'
  const failed = status?.state === 'error' || status?.state === 'disconnected'

  const uptime = connected ? formatUptime(status?.connectedSince) : '00:00:00'
  const countdown = reconnecting && status?.nextRetryAt ? formatCountdown(status.nextRetryAt) : ''
  const countdownPct = useMemo(() => {
    if (!status?.nextRetryAt || !status?.backoffMs) return 0
    const start = status.nextRetryAt - status.backoffMs
    const pct = (now - start) / status.backoffMs
    return Math.min(1, Math.max(0, pct))
  }, [status?.nextRetryAt, status?.backoffMs, now])

  const handleReconnect = useCallback(async () => {
    setIsManualReconnecting(true)
    setReconnectError(null)
    try {
      await reconnect(connectionId)
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : 'Failed to reconnect')
    } finally {
      setIsManualReconnecting(false)
    }
  }, [connectionId, reconnect])

  return (
    <div className={cn('relative overflow-hidden border-b shrink-0 font-mono text-xs', t.border)}>
      <div
        className={cn(
          'absolute inset-0 pointer-events-none transition-opacity duration-500',
          t.glow
        )}
      />

      <div className="relative flex items-center gap-3 px-3 py-2">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'size-2 rounded-full transition-all duration-300',
              t.dot,
              connected && 'motion-safe:animate-[pulse_2s_ease-in-out_infinite]',
              reconnecting && 'motion-safe:animate-ping'
            )}
          />
          <span className={cn('uppercase tracking-wider font-semibold', t.text)}>{label}</span>
        </div>

        <span className="text-muted-foreground/70 shrink-0">│</span>

        <span className="text-muted-foreground truncate">
          <span className="text-foreground/80">pg_notify</span>
          <span className="text-muted-foreground">@</span>
          <span className="text-foreground/70">{hostLabel}</span>
        </span>

        <span className="text-muted-foreground/70 shrink-0">│</span>

        <span className="text-muted-foreground shrink-0 tabular-nums">
          ch <span className="text-foreground/80">{channelCount}</span>
        </span>

        <span className="text-muted-foreground/70 shrink-0">│</span>

        <span className="text-muted-foreground shrink-0 tabular-nums">
          rx <span className="text-foreground/80">{stats.eventsPerSecond.toFixed(1)}</span>
          /s
        </span>

        <span className="text-muted-foreground/70 shrink-0">│</span>

        <span className="text-muted-foreground shrink-0 tabular-nums">
          up <span className={cn('text-foreground/80', connected && 'tabular-nums')}>{uptime}</span>
        </span>

        <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
          <Sparkline samples={samples} tone={tone} />

          {reconnecting && countdown && (
            <span className="text-warning shrink-0 tabular-nums">retry in {countdown}</span>
          )}

          {(failed || reconnecting) && (
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isManualReconnecting}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-all',
                'hover:bg-foreground/5 active:scale-[0.98]',
                t.border,
                t.text
              )}
              title="Reconnect now"
            >
              {isManualReconnecting ? (
                <SpinnerIcon className="size-3 animate-spin" />
              ) : (
                <RefreshIcon className="size-3" />
              )}
              Retry now
            </button>
          )}
        </div>
      </div>

      {reconnecting && status?.backoffMs && (
        <div className="relative h-px bg-border/40 overflow-hidden">
          <div
            className={cn('absolute inset-y-0 left-0', t.bar)}
            style={{ width: `${countdownPct * 100}%`, transition: 'width 1s linear' }}
          />
        </div>
      )}

      {(failed || reconnectError) && (
        <div className="relative px-3 pb-1.5 text-2xs text-destructive/80 truncate">
          {reconnectError ?? status?.lastError ?? 'Connection lost'}
        </div>
      )}
    </div>
  )
}
