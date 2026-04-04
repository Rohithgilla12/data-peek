'use client'

import { Activity, Database, LayoutDashboard, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ConnectionSwitcher } from './connection-switcher'
import { SidebarContent } from './sidebar-content'

const navItems = [
  { href: '/', icon: Database, label: 'Query' },
  { href: '/connections', icon: Database, label: 'Connections' },
  { href: '/dashboards', icon: LayoutDashboard, label: 'Dashboards' },
  { href: '/health', icon: Activity, label: 'Health' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
        <span className="text-sm font-semibold font-mono">data-peek</span>
      </div>

      <ConnectionSwitcher />

      <SidebarContent />

      <nav className="px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all duration-200 press-effect ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'h-7 w-7',
            },
          }}
        />
      </div>
    </aside>
  )
}
