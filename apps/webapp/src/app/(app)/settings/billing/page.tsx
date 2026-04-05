'use client'

import { Check, Zap } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: [
      '2 connections',
      '50 queries/day',
      '10 saved queries',
      '7-day history',
      '1 dashboard',
      'CSV/JSON export',
    ],
    cta: 'Current Plan',
    active: true,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/month',
    features: [
      'Unlimited connections',
      'Unlimited queries',
      'Unlimited saved queries',
      '90-day history',
      'Unlimited dashboards',
      'Inline editing',
      'AI chat',
      'Full health monitor',
      'Column statistics',
      'EXPLAIN plans',
      'Clean share cards',
    ],
    cta: 'Upgrade to Pro',
    active: false,
    highlighted: true,
  },
]

export default function BillingPage() {
  const { data: usage } = trpc.usage.current.useQuery()
  const isPro = usage?.plan === 'pro'

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">Billing</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your subscription and billing.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isCurrent =
            (plan.name === 'Free' && !isPro) || (plan.name === 'Pro' && isPro)
          return (
            <div
              key={plan.name}
              className={`rounded-lg border p-5 ${
                plan.highlighted && !isPro ? 'border-accent bg-accent/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {plan.highlighted && <Zap className="h-4 w-4 text-accent" />}
                <h3 className="text-sm font-semibold">{plan.name}</h3>
              </div>
              <div className="mb-4">
                <span className="text-2xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <ul className="space-y-1.5 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <Check className="h-3 w-3 text-success flex-shrink-0" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="w-full rounded-md border border-border px-4 py-2 text-center text-sm text-muted-foreground">
                  Current Plan
                </div>
              ) : (
                <button
                  className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
                  onClick={() => {
                    // TODO: Wire to DodoPayments checkout when API key is available
                    window.open('https://www.datapeek.dev/download', '_blank')
                  }}
                >
                  {plan.cta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {isPro && (
        <div className="mt-6 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium mb-2">Manage Subscription</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Update payment method, download invoices, or cancel your subscription.
          </p>
          <button
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => {
              // TODO: Wire to DodoPayments customer portal
              window.open('https://www.datapeek.dev/download', '_blank')
            }}
          >
            Open Billing Portal
          </button>
        </div>
      )}
    </div>
  )
}
