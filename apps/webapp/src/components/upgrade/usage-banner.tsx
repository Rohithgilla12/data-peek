'use client'

import { AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import Link from 'next/link'

export function UsageBanner() {
  const { data: usage } = trpc.usage.current.useQuery(undefined, {
    refetchInterval: 60_000,
  })

  if (!usage || usage.plan === 'pro') return null

  const percent =
    usage.limits.queriesPerDay === 0
      ? 0
      : (usage.usage.queriesUsed / usage.limits.queriesPerDay) * 100

  if (percent < 60) return null

  const atLimit = percent >= 100
  const high = percent >= 80

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${
        atLimit
          ? 'bg-destructive/10 border-destructive/30 text-destructive'
          : high
            ? 'bg-warning/10 border-warning/30 text-warning'
            : 'bg-warning/5 border-warning/20 text-warning'
      }`}
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        {atLimit
          ? `Daily query limit reached (${usage.usage.queriesUsed}/${usage.limits.queriesPerDay}).`
          : `${usage.usage.queriesUsed} of ${usage.limits.queriesPerDay} daily queries used.`}
      </span>
      <Link
        href="/settings/billing"
        className="ml-auto font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Upgrade to Pro
      </Link>
    </div>
  )
}
