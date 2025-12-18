import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  LayoutDashboard,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Pencil,
  Copy,
  Plus,
  ExternalLink
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDashboardStore } from '@/stores'
import { DashboardFormDialog } from './dashboard-form-dialog'
import type { Dashboard } from '@shared/index'

/**
 * Format a timestamp into a human-friendly relative date string.
 *
 * @param timestamp - Time in milliseconds since the Unix epoch
 * @returns `Today` if the timestamp is today, `Yesterday` if it was yesterday, `"<n> days ago"` for timestamps 2–6 days ago, or the timestamp formatted with `toLocaleDateString()` for older dates
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - timestamp
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

/**
 * Render the "Dashboards" collapsible sidebar section that lists available dashboards and exposes actions to open, edit, duplicate, or delete them, plus dialogs for creating and editing dashboards.
 *
 * The component initializes the dashboard store if needed, sorts dashboards by last updated time, shows a badge with the count, displays up to five recent dashboards with tooltips and action menus, and provides controls to open a full list or create a new dashboard.
 *
 * @returns The Dashboards sidebar React element
 */
export function Dashboards() {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const dashboards = useDashboardStore((s) => s.dashboards)
  const isInitialized = useDashboardStore((s) => s.isInitialized)
  const initialize = useDashboardStore((s) => s.initialize)
  const deleteDashboard = useDashboardStore((s) => s.deleteDashboard)
  const duplicateDashboard = useDashboardStore((s) => s.duplicateDashboard)
  const setActiveDashboard = useDashboardStore((s) => s.setActiveDashboard)

  const [editingDashboard, setEditingDashboard] = useState<Dashboard | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)

  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  const sortedDashboards = [...dashboards].sort((a, b) => b.updatedAt - a.updatedAt)

  const handleOpenDashboard = (dashboard: Dashboard) => {
    setActiveDashboard(dashboard.id)
    navigate({ to: '/dashboard/$dashboardId', params: { dashboardId: dashboard.id } })
  }

  const handleEditDashboard = (dashboard: Dashboard) => {
    setEditingDashboard(dashboard)
    setIsEditDialogOpen(true)
  }

  const handleDuplicateDashboard = async (dashboard: Dashboard) => {
    await duplicateDashboard(dashboard.id)
  }

  const handleDeleteDashboard = async (id: string) => {
    if (confirm('Are you sure you want to delete this dashboard?')) {
      await deleteDashboard(id)
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1">
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <span>Dashboards</span>
            {sortedDashboards.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[11px] px-1.5 py-0">
                {sortedDashboards.length}
              </Badge>
            )}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedDashboards.length === 0 ? (
                <div className="px-2 py-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">No dashboards yet</p>
                  <SidebarMenuButton
                    onClick={() => setIsFormDialogOpen(true)}
                    className="mx-auto w-auto"
                  >
                    <Plus className="size-4" />
                    <span>New Dashboard</span>
                  </SidebarMenuButton>
                </div>
              ) : (
                sortedDashboards.slice(0, 5).map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            onClick={() => handleOpenDashboard(item)}
                            className="h-auto py-1.5"
                          >
                            <div className="flex flex-col items-start gap-0.5 w-full min-w-0">
                              <div className="flex items-center gap-1.5 w-full">
                                <LayoutDashboard className="size-3 text-muted-foreground" />
                                <span className="text-xs truncate font-medium">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>
                                  {item.widgets.length} widget{item.widgets.length !== 1 ? 's' : ''}
                                </span>
                                <span>·</span>
                                <span>{formatDate(item.updatedAt)}</span>
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="space-y-1">
                            <p className="font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                            <p className="text-xs">
                              {item.widgets.length} widget{item.widgets.length !== 1 ? 's' : ''}
                            </p>
                            {item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal />
                          <span className="sr-only">More</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-48 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        align={isMobile ? 'end' : 'start'}
                      >
                        <DropdownMenuItem onClick={() => handleOpenDashboard(item)}>
                          <ExternalLink className="text-muted-foreground" />
                          <span>Open</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditDashboard(item)}>
                          <Pencil className="text-muted-foreground" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateDashboard(item)}>
                          <Copy className="text-muted-foreground" />
                          <span>Duplicate</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={() => handleDeleteDashboard(item.id)}
                        >
                          <Trash2 className="text-red-400" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))
              )}
              {sortedDashboards.length > 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsFormDialogOpen(true)}
                  >
                    <LayoutDashboard className="size-4" />
                    <span>View all ({sortedDashboards.length})</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {sortedDashboards.length > 0 && sortedDashboards.length <= 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsFormDialogOpen(true)}
                  >
                    <Plus className="size-4" />
                    <span>New Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>

        <DashboardFormDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) setEditingDashboard(null)
          }}
          editingDashboard={editingDashboard}
        />

        <DashboardFormDialog
          open={isFormDialogOpen}
          onOpenChange={setIsFormDialogOpen}
          editingDashboard={null}
        />
      </SidebarGroup>
    </Collapsible>
  )
}
