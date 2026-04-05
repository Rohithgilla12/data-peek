'use client'

import { Check, X, Zap } from 'lucide-react'
import Link from 'next/link'

const proFeatures = [
  'Unlimited connections',
  'Unlimited queries per day',
  'Unlimited saved queries',
  '90-day query history',
  'Unlimited dashboards',
  'Inline editing',
  'AI chat assistant',
  'Full health monitor',
  'Column statistics',
  'EXPLAIN plans',
  'Clean share cards',
]

interface UpgradeDialogProps {
  open: boolean
  onClose: () => void
  feature?: string
}

export function UpgradeDialog({ open, onClose, feature }: UpgradeDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-5 w-5 text-accent" />
          <h2 className="text-base font-semibold">Upgrade to Pro</h2>
        </div>

        {feature && (
          <p className="text-sm text-muted-foreground mb-4">
            <span className="font-medium text-foreground">{feature}</span> requires a Pro plan.
          </p>
        )}

        {!feature && (
          <p className="text-sm text-muted-foreground mb-4">
            Unlock everything data-peek has to offer.
          </p>
        )}

        <ul className="space-y-1.5 mb-5">
          {proFeatures.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs">
              <Check className="h-3 w-3 text-success flex-shrink-0" />
              <span className="text-foreground">{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-2xl font-bold">$12</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>

        <Link
          href="/settings/billing"
          onClick={onClose}
          className="block w-full rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          View Plans
        </Link>
      </div>
    </div>
  )
}
