'use client'

import { MessageCircleQuestion, Settings2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { ConnectionSwitcher } from '@/components/connection-switcher'
import { QueryHistory } from '@/components/query-history'
import { SavedQueries } from '@/components/saved-queries'
import { SchemaExplorer } from '@/components/schema-explorer'
import { SidebarQuickQuery } from '@/components/sidebar-quick-query'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const platform = window.electron.process.platform

  return (
    <Sidebar className="border-r-0 bg-sidebar/80 backdrop-blur-xl" {...props}>
      {/* Header - Connection Switcher */}
      <SidebarHeader className={cn(platform === 'darwin' && 'pt-10')}>
        <ConnectionSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {/* Quick Query Panel */}
        <SidebarQuickQuery />

        <SidebarSeparator className="mx-3" />

        {/* Schema Explorer */}
        <SchemaExplorer />

        <SidebarSeparator className="mx-3" />

        {/* Query History */}
        <QueryHistory />

        <SidebarSeparator className="mx-3" />

        {/* Saved Queries */}
        <SavedQueries />

        {/* Secondary Navigation - Settings & Help */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/settings">
                    <Settings2 className="size-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="https://github.com/Rohithgilla12/data-peek"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircleQuestion className="size-4" />
                    <span>Help</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
