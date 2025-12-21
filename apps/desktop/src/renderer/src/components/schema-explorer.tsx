import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronRight,
  Columns3,
  Key,
  RefreshCw,
  Table2,
  Database as SchemaIcon,
  Loader2,
  XCircle,
  Search,
  X,
  Network,
  Plus,
  Pencil,
  MoreHorizontal,
  FunctionSquare,
  Workflow,
  ArrowRight,
  Eye,
  Play,
  Filter,
  Focus
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectionStore, useTabStore } from '@/stores'
import type { TableInfo, RoutineInfo } from '@shared/index'

// Threshold for enabling virtualization
const VIRTUALIZATION_THRESHOLD = 50

function DataTypeBadge({ type }: { type: string }) {
  const getTypeColor = (t: string): string => {
    const lower = t.toLowerCase()
    if (lower.includes('uuid')) return 'bg-purple-500/10 text-purple-500'
    if (lower.includes('varchar') || lower.includes('text') || lower.includes('char'))
      return 'bg-green-500/10 text-green-500'
    if (
      lower.includes('int') ||
      lower.includes('numeric') ||
      lower.includes('decimal') ||
      lower.includes('bigint')
    )
      return 'bg-blue-500/10 text-blue-500'
    if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time'))
      return 'bg-orange-500/10 text-orange-500'
    if (lower.includes('bool')) return 'bg-yellow-500/10 text-yellow-500'
    return 'bg-muted text-muted-foreground'
  }

  return (
    <Badge variant="outline" className={`text-[11px] px-1.5 py-0 font-mono ${getTypeColor(type)}`}>
      {type}
    </Badge>
  )
}

// Union type for items in virtualized list
type SchemaItem =
  | { type: 'table'; data: TableInfo; schemaName: string }
  | { type: 'routine'; data: RoutineInfo; schemaName: string }

interface VirtualizedSchemaItemsProps {
  items: SchemaItem[]
  schemaName: string
  expandedTables: Set<string>
  expandedRoutines: Set<string>
  onToggleTable: (tableKey: string) => void
  onToggleRoutine: (routineKey: string) => void
  onTableClick: (schemaName: string, table: TableInfo) => void
  onEditTable: (schemaName: string, tableName: string) => void
  onExecuteRoutine: (
    schemaName: string,
    routineName: string,
    routineType: 'function' | 'procedure',
    parameters: Array<{ name: string; dataType: string; mode: string }>
  ) => void
}

function VirtualizedSchemaItems({
  items,
  schemaName,
  expandedTables,
  expandedRoutines,
  onToggleTable,
  onToggleRoutine,
  onTableClick,
  onEditTable,
  onExecuteRoutine
}: VirtualizedSchemaItemsProps) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index]
      if (item.type === 'table') {
        const tableKey = `${schemaName}.${item.data.name}`
        return expandedTables.has(tableKey) ? 28 + item.data.columns.length * 24 : 28
      } else {
        const routineKey = `${schemaName}.${item.data.name}`
        const paramCount = item.data.parameters.length + (item.data.returnType ? 1 : 0)
        // Account for "No parameters" message when there are no params and no return type
        const hasNoParamsMessage = item.data.parameters.length === 0 && !item.data.returnType
        const contentCount = paramCount === 0 && hasNoParamsMessage ? 1 : paramCount
        return expandedRoutines.has(routineKey) ? 28 + contentCount * 24 : 28
      }
    },
    overscan: 5
  })

  // Recalculate sizes when expanded state changes
  React.useEffect(() => {
    virtualizer.measure()
  }, [expandedTables, expandedRoutines, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{
        height: Math.min(400, virtualizer.getTotalSize()),
        maxHeight: 400
      }}
    >
      <SidebarMenuSub
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index]
          if (item.type === 'table') {
            const table = item.data
            const tableKey = `${schemaName}.${table.name}`
            const isExpanded = expandedTables.has(tableKey)

            return (
              <SidebarMenuSubItem
                key={tableKey}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <div className="flex items-center group/table">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 p-0 mr-1"
                    onClick={() => onToggleTable(tableKey)}
                  >
                    <ChevronRight
                      className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </Button>
                  <SidebarMenuSubButton
                    onClick={() => onTableClick(schemaName, table)}
                    className="flex-1"
                  >
                    <Table2
                      className={`size-3.5 ${table.type === 'view' ? 'text-purple-500' : 'text-muted-foreground'}`}
                    />
                    <span className="flex-1 truncate">{table.name}</span>
                    {table.type === 'view' && (
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 text-purple-500">
                        view
                      </Badge>
                    )}
                  </SidebarMenuSubButton>
                  {table.type === 'table' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 p-0 opacity-0 group-hover/table:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onTableClick(schemaName, table)}>
                          <Table2 className="size-4 mr-2" />
                          View Data
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditTable(schemaName, table.name)}>
                          <Pencil className="size-4 mr-2" />
                          Edit Table
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {isExpanded && (
                  <div className="ml-6 border-l border-border/50 pl-2 py-1 space-y-0.5">
                    {table.columns.map((column) => (
                      <TooltipProvider key={column.name}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground hover:bg-accent/50 rounded cursor-default">
                              {column.isPrimaryKey ? (
                                <Key className="size-3 text-yellow-500" />
                              ) : (
                                <Columns3 className="size-3" />
                              )}
                              <span
                                className={column.isPrimaryKey ? 'font-medium text-foreground' : ''}
                              >
                                {column.name}
                              </span>
                              {!column.isNullable && !column.isPrimaryKey && (
                                <span className="text-red-400 text-[10px]">*</span>
                              )}
                              <DataTypeBadge type={column.dataType} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            <div className="space-y-1">
                              <div>
                                <span className="text-muted-foreground">Type: </span>
                                {column.dataType}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Nullable: </span>
                                {column.isNullable ? 'Yes' : 'No'}
                              </div>
                              {column.isPrimaryKey && (
                                <div className="text-yellow-500">Primary Key</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                )}
              </SidebarMenuSubItem>
            )
          } else {
            const routine = item.data
            const routineKey = `${schemaName}.${routine.name}`
            const isExpanded = expandedRoutines.has(routineKey)

            return (
              <SidebarMenuSubItem
                key={routineKey}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <div className="flex items-center group/routine">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 p-0 mr-1"
                    onClick={() => onToggleRoutine(routineKey)}
                  >
                    <ChevronRight
                      className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </Button>
                  <SidebarMenuSubButton className="flex-1 cursor-default">
                    {routine.type === 'function' ? (
                      <FunctionSquare className="size-3.5 text-cyan-500" />
                    ) : (
                      <Workflow className="size-3.5 text-orange-500" />
                    )}
                    <span className="flex-1 truncate">{routine.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-1.5 py-0 ${
                        routine.type === 'function' ? 'text-cyan-500' : 'text-orange-500'
                      }`}
                    >
                      {routine.type === 'function' ? 'fn' : 'proc'}
                    </Badge>
                  </SidebarMenuSubButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 p-0 opacity-0 group-hover/routine:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() =>
                          onExecuteRoutine(
                            schemaName,
                            routine.name,
                            routine.type,
                            routine.parameters
                          )
                        }
                      >
                        <Play className="size-4 mr-2" />
                        Execute
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {isExpanded && (
                  <div className="ml-6 border-l border-border/50 pl-2 py-1 space-y-0.5">
                    {routine.returnType && (
                      <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground">
                        <ArrowRight className="size-3 text-cyan-500" />
                        <span className="text-muted-foreground">returns</span>
                        <DataTypeBadge type={routine.returnType} />
                      </div>
                    )}
                    {routine.parameters.map((param) => (
                      <TooltipProvider key={param.name}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground hover:bg-accent/50 rounded cursor-default">
                              <Columns3 className="size-3" />
                              <span>{param.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-[11px] px-1.5 py-0 ${
                                  param.mode === 'OUT'
                                    ? 'text-orange-400'
                                    : param.mode === 'INOUT'
                                      ? 'text-yellow-400'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {param.mode}
                              </Badge>
                              <DataTypeBadge type={param.dataType} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            <div className="space-y-1">
                              <div>
                                <span className="text-muted-foreground">Type: </span>
                                {param.dataType}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Mode: </span>
                                {param.mode}
                              </div>
                              {param.defaultValue && (
                                <div>
                                  <span className="text-muted-foreground">Default: </span>
                                  {param.defaultValue}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                    {routine.parameters.length === 0 && !routine.returnType && (
                      <div className="py-0.5 px-1 text-xs text-muted-foreground italic">
                        No parameters
                      </div>
                    )}
                  </div>
                )}
              </SidebarMenuSubItem>
            )
          }
        })}
      </SidebarMenuSub>
    </div>
  )
}

export function SchemaExplorer() {
  const schemas = useConnectionStore((s) => s.schemas)
  const isLoadingSchema = useConnectionStore((s) => s.isLoadingSchema)
  const schemaError = useConnectionStore((s) => s.schemaError)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)
  const fetchSchemas = useConnectionStore((s) => s.fetchSchemas)
  const schemaFromCache = useConnectionStore((s) => s.schemaFromCache)
  const isRefreshingSchema = useConnectionStore((s) => s.isRefreshingSchema)

  const createTablePreviewTab = useTabStore((s) => s.createTablePreviewTab)
  const findTablePreviewTab = useTabStore((s) => s.findTablePreviewTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const createERDTab = useTabStore((s) => s.createERDTab)
  const createTableDesignerTab = useTabStore((s) => s.createTableDesignerTab)

  const [expandedSchemas, setExpandedSchemas] = React.useState<Set<string>>(
    new Set(schemas.map((s) => s.name))
  )
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set())
  const [expandedRoutines, setExpandedRoutines] = React.useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = React.useState('')

  // Schema focus - when set, only show this schema
  const [focusedSchema, setFocusedSchema] = React.useState<string | null>(null)

  // Filter toggles
  const [showTables, setShowTables] = React.useState(true)
  const [showViews, setShowViews] = React.useState(true)
  const [showFunctions, setShowFunctions] = React.useState(false)
  const [showProcedures, setShowProcedures] = React.useState(true)

  const createQueryTab = useTabStore((s) => s.createQueryTab)

  // Filter schemas and tables/routines based on search query, filter toggles, and focused schema
  const filteredSchemas = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    return schemas
      .filter((schema) => {
        // If a schema is focused, only show that schema
        if (focusedSchema && schema.name !== focusedSchema) return false
        return true
      })
      .map((schema) => {
        // Filter tables based on type and search
        const filteredTables = schema.tables.filter((table) => {
          // Type filter
          if (table.type === 'table' && !showTables) return false
          if (table.type === 'view' && !showViews) return false
          // Search filter
          if (query && !table.name.toLowerCase().includes(query)) return false
          return true
        })

        // Filter routines based on type and search
        const filteredRoutines = schema.routines?.filter((routine) => {
          // Type filter
          if (routine.type === 'function' && !showFunctions) return false
          if (routine.type === 'procedure' && !showProcedures) return false
          // Search filter
          if (query && !routine.name.toLowerCase().includes(query)) return false
          return true
        })

        return {
          ...schema,
          tables: filteredTables,
          routines: filteredRoutines
        }
      })
      .filter((schema) => schema.tables.length > 0 || (schema.routines?.length ?? 0) > 0)
  }, [schemas, searchQuery, showTables, showViews, showFunctions, showProcedures, focusedSchema])

  // Auto-expand schemas when searching
  React.useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedSchemas(new Set(filteredSchemas.map((s) => s.name)))
    }
  }, [searchQuery, filteredSchemas])

  // Update expanded schemas when schemas change
  React.useEffect(() => {
    setExpandedSchemas(new Set(schemas.map((s) => s.name)))
    setExpandedTables(new Set())
    setExpandedRoutines(new Set())
    // Reset focused schema if it no longer exists
    if (focusedSchema && !schemas.some((s) => s.name === focusedSchema)) {
      setFocusedSchema(null)
    }
  }, [schemas, focusedSchema])

  const toggleSchema = (schemaName: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev)
      if (next.has(schemaName)) {
        next.delete(schemaName)
      } else {
        next.add(schemaName)
      }
      return next
    })
  }

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableKey)) {
        next.delete(tableKey)
      } else {
        next.add(tableKey)
      }
      return next
    })
  }

  const toggleRoutine = (routineKey: string) => {
    setExpandedRoutines((prev) => {
      const next = new Set(prev)
      if (next.has(routineKey)) {
        next.delete(routineKey)
      } else {
        next.add(routineKey)
      }
      return next
    })
  }

  const handleTableClick = (schemaName: string, table: TableInfo) => {
    const connection = getActiveConnection()
    if (!connection) return

    // Check if tab already exists for this table - navigate to it instead of creating new
    const existingTab = findTablePreviewTab(connection.id, schemaName, table.name)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    // Create a new table preview tab
    createTablePreviewTab(connection.id, schemaName, table.name)
  }

  const handleRefresh = () => {
    if (!activeConnectionId) return
    fetchSchemas(undefined, true) // Force refresh
  }

  const handleOpenERD = () => {
    if (!activeConnectionId) return
    createERDTab(activeConnectionId)
  }

  const handleCreateTable = (schemaName: string = 'public') => {
    if (!activeConnectionId) return
    createTableDesignerTab(activeConnectionId, schemaName)
  }

  const handleEditTable = (schemaName: string, tableName: string) => {
    if (!activeConnectionId) return
    createTableDesignerTab(activeConnectionId, schemaName, tableName)
  }

  // Generate execute SQL template based on database type
  const generateExecuteSQL = (
    schemaName: string,
    routineName: string,
    routineType: 'function' | 'procedure',
    parameters: Array<{ name: string; dataType: string; mode: string }>
  ): string => {
    const connection = getActiveConnection()
    if (!connection) return ''

    const dbType = connection.dbType
    const qualifiedName = `"${schemaName}"."${routineName}"`
    const paramPlaceholders = parameters
      .filter((p) => p.mode === 'IN' || p.mode === 'INOUT')
      .map((p) => `/* ${p.name}: ${p.dataType} */`)
      .join(', ')

    switch (dbType) {
      case 'postgresql':
        if (routineType === 'procedure') {
          return `CALL ${qualifiedName}(${paramPlaceholders});`
        }
        return `SELECT * FROM ${qualifiedName}(${paramPlaceholders});`

      case 'mysql':
        return `CALL \`${schemaName}\`.\`${routineName}\`(${paramPlaceholders});`

      case 'mssql': {
        const mssqlParams = parameters
          .filter((p) => p.mode === 'IN' || p.mode === 'INOUT')
          .map((p) => `@${p.name} = /* ${p.dataType} */`)
          .join(', ')
        return `EXEC [${schemaName}].[${routineName}] ${mssqlParams};`
      }

      default:
        return `-- Execute ${routineName}`
    }
  }

  const handleExecuteRoutine = (
    schemaName: string,
    routineName: string,
    routineType: 'function' | 'procedure',
    parameters: Array<{ name: string; dataType: string; mode: string }>
  ) => {
    const connection = getActiveConnection()
    if (!connection) return

    const sql = generateExecuteSQL(schemaName, routineName, routineType, parameters)
    createQueryTab(connection.id, sql)
  }

  // Check if any filter is active (not all enabled)
  const isFilterActive = !showTables || !showViews || !showFunctions || !showProcedures

  // Clear focused schema
  const handleClearFocus = () => {
    setFocusedSchema(null)
  }

  if (!activeConnectionId) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Schema</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
            Select a connection to browse schema
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  if (isLoadingSchema) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Schema</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  if (schemaError) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center justify-between">
          <span>Schema</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 p-0 hover:bg-sidebar-accent"
            onClick={handleRefresh}
            title="Retry"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-2 py-4 text-xs text-destructive text-center">
            <XCircle className="size-4 mx-auto mb-2" />
            {schemaError}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Schema</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-5 p-0 hover:bg-sidebar-accent"
            onClick={() => handleCreateTable()}
            title="Create new table"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 p-0 hover:bg-sidebar-accent"
            onClick={handleOpenERD}
            title="View ERD diagram"
          >
            <Network className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`size-5 p-0 hover:bg-sidebar-accent ${isFilterActive ? 'text-primary' : ''}`}
                title="Filter objects"
              >
                <Filter className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Show Objects</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showTables}
                onCheckedChange={setShowTables}
                className="text-xs"
              >
                <Table2 className="size-3.5 mr-2 text-muted-foreground" />
                Tables
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showViews}
                onCheckedChange={setShowViews}
                className="text-xs"
              >
                <Eye className="size-3.5 mr-2 text-purple-500" />
                Views
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showFunctions}
                onCheckedChange={setShowFunctions}
                className="text-xs"
              >
                <FunctionSquare className="size-3.5 mr-2 text-cyan-500" />
                Functions
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showProcedures}
                onCheckedChange={setShowProcedures}
                className="text-xs"
              >
                <Workflow className="size-3.5 mr-2 text-orange-500" />
                Procedures
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`size-5 p-0 hover:bg-sidebar-accent ${focusedSchema ? 'text-primary' : ''}`}
                title={focusedSchema ? `Focused on: ${focusedSchema}` : 'Focus on schema'}
              >
                <Focus className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Focus on Schema</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={focusedSchema ?? ''}
                onValueChange={(v) => setFocusedSchema(v || null)}
              >
                <DropdownMenuRadioItem value="" className="text-xs">
                  <span className="text-muted-foreground">All schemas</span>
                </DropdownMenuRadioItem>
                {schemas.map((schema) => (
                  <DropdownMenuRadioItem key={schema.name} value={schema.name} className="text-xs">
                    <SchemaIcon className="size-3.5 mr-2 text-muted-foreground" />
                    {schema.name}
                    <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                      {schema.tables.length}
                    </Badge>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 p-0 hover:bg-sidebar-accent"
                  onClick={handleRefresh}
                  disabled={isRefreshingSchema}
                >
                  <RefreshCw className={`size-3.5 ${isRefreshingSchema ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isRefreshingSchema
                  ? 'Refreshing schema...'
                  : schemaFromCache
                    ? 'Refresh schema (loaded from cache)'
                    : 'Refresh schema'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {/* Focused Schema Indicator */}
        {focusedSchema && (
          <div className="px-2 pb-2">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-primary/10 rounded-md text-xs">
              <div className="flex items-center gap-1.5 text-primary">
                <Focus className="size-3" />
                <span className="font-medium">{focusedSchema}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-4 p-0 hover:bg-primary/20 text-primary"
                onClick={handleClearFocus}
                title="Clear focus"
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
        )}
        {/* Search Input */}
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tables, routines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-7 pr-7 text-xs"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 size-6 hover:bg-transparent"
                onClick={() => setSearchQuery('')}
              >
                <X className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
        <SidebarMenu>
          {filteredSchemas.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
              {searchQuery ? 'No tables or routines match your search' : 'No schemas found'}
            </div>
          ) : (
            filteredSchemas.map((schema) => (
              <Collapsible
                key={schema.name}
                open={expandedSchemas.has(schema.name)}
                onOpenChange={() => toggleSchema(schema.name)}
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <ChevronRight
                        className={`size-4 transition-transform ${expandedSchemas.has(schema.name) ? 'rotate-90' : ''}`}
                      />
                      <SchemaIcon className="size-4 text-muted-foreground" />
                      <span>{schema.name}</span>
                      <Badge variant="outline" className="ml-auto text-[11px] px-1.5 py-0">
                        {schema.tables.length + (schema.routines?.length ?? 0)}
                      </Badge>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {(() => {
                      const itemCount = schema.tables.length + (schema.routines?.length ?? 0)
                      const shouldVirtualize = itemCount > VIRTUALIZATION_THRESHOLD

                      if (shouldVirtualize) {
                        // Build unified items list for virtualization
                        const items: SchemaItem[] = [
                          ...schema.tables.map(
                            (table): SchemaItem => ({
                              type: 'table',
                              data: table,
                              schemaName: schema.name
                            })
                          ),
                          ...(schema.routines ?? []).map(
                            (routine): SchemaItem => ({
                              type: 'routine',
                              data: routine,
                              schemaName: schema.name
                            })
                          )
                        ]

                        return (
                          <VirtualizedSchemaItems
                            items={items}
                            schemaName={schema.name}
                            expandedTables={expandedTables}
                            expandedRoutines={expandedRoutines}
                            onToggleTable={toggleTable}
                            onToggleRoutine={toggleRoutine}
                            onTableClick={handleTableClick}
                            onEditTable={handleEditTable}
                            onExecuteRoutine={handleExecuteRoutine}
                          />
                        )
                      }

                      // Non-virtualized rendering for smaller lists
                      return (
                        <SidebarMenuSub>
                          {schema.tables.map((table) => {
                            const tableKey = `${schema.name}.${table.name}`
                            return (
                              <Collapsible
                                key={tableKey}
                                open={expandedTables.has(tableKey)}
                                onOpenChange={() => toggleTable(tableKey)}
                              >
                                <SidebarMenuSubItem>
                                  <div className="flex items-center group/table">
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-5 p-0 mr-1"
                                      >
                                        <ChevronRight
                                          className={`size-3 transition-transform ${expandedTables.has(tableKey) ? 'rotate-90' : ''}`}
                                        />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <SidebarMenuSubButton
                                      onClick={() => handleTableClick(schema.name, table)}
                                      className="flex-1"
                                    >
                                      <Table2
                                        className={`size-3.5 ${table.type === 'view' ? 'text-purple-500' : 'text-muted-foreground'}`}
                                      />
                                      <span className="flex-1">{table.name}</span>
                                      {table.type === 'view' && (
                                        <Badge
                                          variant="outline"
                                          className="text-[11px] px-1.5 py-0 text-purple-500"
                                        >
                                          view
                                        </Badge>
                                      )}
                                    </SidebarMenuSubButton>
                                    {table.type === 'table' && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-5 p-0 opacity-0 group-hover/table:opacity-100 transition-opacity"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MoreHorizontal className="size-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40">
                                          <DropdownMenuItem
                                            onClick={() => handleTableClick(schema.name, table)}
                                          >
                                            <Table2 className="size-4 mr-2" />
                                            View Data
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleEditTable(schema.name, table.name)}
                                          >
                                            <Pencil className="size-4 mr-2" />
                                            Edit Table
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                  <CollapsibleContent>
                                    <div className="ml-6 border-l border-border/50 pl-2 py-1 space-y-0.5">
                                      {table.columns.map((column) => (
                                        <TooltipProvider key={column.name}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground hover:bg-accent/50 rounded cursor-default">
                                                {column.isPrimaryKey ? (
                                                  <Key className="size-3 text-yellow-500" />
                                                ) : (
                                                  <Columns3 className="size-3" />
                                                )}
                                                <span
                                                  className={
                                                    column.isPrimaryKey
                                                      ? 'font-medium text-foreground'
                                                      : ''
                                                  }
                                                >
                                                  {column.name}
                                                </span>
                                                {!column.isNullable && !column.isPrimaryKey && (
                                                  <span className="text-red-400 text-[10px]">
                                                    *
                                                  </span>
                                                )}
                                                <DataTypeBadge type={column.dataType} />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="text-xs">
                                              <div className="space-y-1">
                                                <div>
                                                  <span className="text-muted-foreground">
                                                    Type:{' '}
                                                  </span>
                                                  {column.dataType}
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">
                                                    Nullable:{' '}
                                                  </span>
                                                  {column.isNullable ? 'Yes' : 'No'}
                                                </div>
                                                {column.isPrimaryKey && (
                                                  <div className="text-yellow-500">Primary Key</div>
                                                )}
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </SidebarMenuSubItem>
                              </Collapsible>
                            )
                          })}
                          {/* Routines (Functions and Stored Procedures) */}
                          {schema.routines?.map((routine) => {
                            const routineKey = `${schema.name}.${routine.name}`
                            return (
                              <Collapsible
                                key={routineKey}
                                open={expandedRoutines.has(routineKey)}
                                onOpenChange={() => toggleRoutine(routineKey)}
                              >
                                <SidebarMenuSubItem>
                                  <div className="flex items-center group/routine">
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-5 p-0 mr-1"
                                      >
                                        <ChevronRight
                                          className={`size-3 transition-transform ${expandedRoutines.has(routineKey) ? 'rotate-90' : ''}`}
                                        />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <SidebarMenuSubButton className="flex-1 cursor-default">
                                      {routine.type === 'function' ? (
                                        <FunctionSquare className="size-3.5 text-cyan-500" />
                                      ) : (
                                        <Workflow className="size-3.5 text-orange-500" />
                                      )}
                                      <span className="flex-1">{routine.name}</span>
                                      <Badge
                                        variant="outline"
                                        className={`text-[11px] px-1.5 py-0 ${
                                          routine.type === 'function'
                                            ? 'text-cyan-500'
                                            : 'text-orange-500'
                                        }`}
                                      >
                                        {routine.type === 'function' ? 'fn' : 'proc'}
                                      </Badge>
                                    </SidebarMenuSubButton>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-5 p-0 opacity-0 group-hover/routine:opacity-100 transition-opacity"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <MoreHorizontal className="size-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleExecuteRoutine(
                                              schema.name,
                                              routine.name,
                                              routine.type,
                                              routine.parameters
                                            )
                                          }
                                        >
                                          <Play className="size-4 mr-2" />
                                          Execute
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  <CollapsibleContent>
                                    <div className="ml-6 border-l border-border/50 pl-2 py-1 space-y-0.5">
                                      {/* Return type for functions */}
                                      {routine.returnType && (
                                        <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground">
                                          <ArrowRight className="size-3 text-cyan-500" />
                                          <span className="text-muted-foreground">returns</span>
                                          <DataTypeBadge type={routine.returnType} />
                                        </div>
                                      )}
                                      {/* Parameters */}
                                      {routine.parameters.map((param) => (
                                        <TooltipProvider key={param.name}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground hover:bg-accent/50 rounded cursor-default">
                                                <Columns3 className="size-3" />
                                                <span>{param.name}</span>
                                                <Badge
                                                  variant="outline"
                                                  className={`text-[11px] px-1.5 py-0 ${
                                                    param.mode === 'OUT'
                                                      ? 'text-orange-400'
                                                      : param.mode === 'INOUT'
                                                        ? 'text-yellow-400'
                                                        : 'text-muted-foreground'
                                                  }`}
                                                >
                                                  {param.mode}
                                                </Badge>
                                                <DataTypeBadge type={param.dataType} />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="text-xs">
                                              <div className="space-y-1">
                                                <div>
                                                  <span className="text-muted-foreground">
                                                    Type:{' '}
                                                  </span>
                                                  {param.dataType}
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">
                                                    Mode:{' '}
                                                  </span>
                                                  {param.mode}
                                                </div>
                                                {param.defaultValue && (
                                                  <div>
                                                    <span className="text-muted-foreground">
                                                      Default:{' '}
                                                    </span>
                                                    {param.defaultValue}
                                                  </div>
                                                )}
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ))}
                                      {routine.parameters.length === 0 && !routine.returnType && (
                                        <div className="py-0.5 px-1 text-xs text-muted-foreground italic">
                                          No parameters
                                        </div>
                                      )}
                                    </div>
                                  </CollapsibleContent>
                                </SidebarMenuSubItem>
                              </Collapsible>
                            )
                          })}
                        </SidebarMenuSub>
                      )
                    })()}
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
