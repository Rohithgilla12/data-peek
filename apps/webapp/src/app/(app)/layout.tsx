import { Suspense } from 'react'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { UsageBanner } from '@/components/upgrade/usage-banner'
import { UrlSync } from '@/components/url-sync'
import { CommandPalette } from '@/components/command-palette'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <div className="flex h-screen overflow-hidden">
        <UrlSync />
        <CommandPalette />
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <UsageBanner />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </Suspense>
  )
}
