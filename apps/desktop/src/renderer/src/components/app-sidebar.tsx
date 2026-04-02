import { Activity, Bell, MessageCircleQuestion, Settings2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { ConnectionSwitcher } from '@/components/connection-switcher'
import { Dashboards } from '@/components/dashboard'
import { QueryHistory } from '@/components/query-history'
import { SavedQueries } from '@/components/saved-queries'
import { ScheduledQueries } from '@/components/scheduled-queries'
import { SchemaExplorer } from '@/components/schema-explorer'
import { SidebarQuickQuery } from '@/components/sidebar-quick-query'
import { Snippets } from '@/components/snippets'
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
import { useConnectionStore, useTabStore } from '@/stores'
import { cn } from '@/lib/utils'

/**
 * Render the application's multi-section sidebar with connection switching, query tools, schema access, history, saved and scheduled queries, dashboards, and secondary navigation.
 *
 * The component forwards all received props to the underlying Sidebar root and applies a small macOS-specific top padding to the header when running on Darwin platforms.
 *
 * @param props - Props forwarded to the underlying Sidebar component
 * @returns A React element containing the assembled application sidebar
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const platform = window.electron.process.platform
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === activeConnectionId)
  )
  const createPgNotificationsTab = useTabStore((s) => s.createPgNotificationsTab)
  const createHealthMonitorTab = useTabStore((s) => s.createHealthMonitorTab)
  const isPostgres = activeConnection?.dbType === 'postgresql'

  const handleOpenNotifications = () => {
    if (activeConnectionId) {
      createPgNotificationsTab(activeConnectionId)
    }
  }

  const handleOpenHealthMonitor = () => {
    if (activeConnectionId) {
      createHealthMonitorTab(activeConnectionId)
    }
  }

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

        {activeConnectionId && (
          <>
            <SidebarSeparator className="mx-3" />

            {/* Query Tools: History, Saved, Snippets */}
            <QueryHistory />
            <SavedQueries />
            <Snippets />

            <SidebarSeparator className="mx-3" />

            {/* Automation & Monitoring */}
            <ScheduledQueries />
            <Dashboards />

            {(isPostgres || activeConnectionId) && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {isPostgres && (
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={handleOpenNotifications}>
                          <Bell className="size-4" />
                          <span>Notifications</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={handleOpenHealthMonitor}>
                        <Activity className="size-4" />
                        <span>Health Monitor</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}

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
