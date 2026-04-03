'use client'

import { useUser } from '@clerk/nextjs'
import { trpc } from '@/lib/trpc-client'

export default function SettingsPage() {
  const { user } = useUser()
  const { data: usage } = trpc.usage.current.useQuery()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold mb-6">Settings</h1>

      <div className="space-y-6">
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium mb-3">Profile</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground">
                {user?.primaryEmailAddress?.emailAddress ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground">{user?.fullName ?? '—'}</span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium mb-3">Plan & Usage</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Plan</span>
              <span
                className={`font-medium ${usage?.plan === 'pro' ? 'text-accent' : 'text-foreground'}`}
              >
                {usage?.plan === 'pro' ? 'Pro' : 'Free'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Queries Today</span>
              <span className="text-foreground">
                {usage?.usage.queriesUsed ?? 0}
                {usage?.plan === 'free' && ` / ${usage?.limits.queriesPerDay}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connections</span>
              <span className="text-foreground">
                {usage?.usage.connectionsUsed ?? 0}
                {usage?.plan === 'free' && ` / ${usage?.limits.connections}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saved Queries</span>
              <span className="text-foreground">
                {usage?.usage.savedQueriesUsed ?? 0}
                {usage?.plan === 'free' && ` / ${usage?.limits.savedQueries}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dashboards</span>
              <span className="text-foreground">
                {usage?.usage.dashboardsUsed ?? 0}
                {usage?.plan === 'free' && ` / ${usage?.limits.dashboards}`}
              </span>
            </div>
          </div>
          {usage?.plan === 'free' && (
            <a
              href="/settings/billing"
              className="mt-4 block w-full rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
            >
              Upgrade to Pro
            </a>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium mb-3">Preferences</h2>
          <p className="text-xs text-muted-foreground">
            Theme, editor config, and AI provider settings coming soon.
          </p>
        </section>
      </div>
    </div>
  )
}
