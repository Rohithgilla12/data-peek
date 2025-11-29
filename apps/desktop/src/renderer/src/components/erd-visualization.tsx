'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  MarkerType,
  Handle
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Key, Columns3, GitBranch, Filter, X, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SchemaInfo, ColumnInfo } from '@shared/index'

interface TableNodeData extends Record<string, unknown> {
  label: string
  schemaName: string
  columns: ColumnInfo[]
  isHub: boolean
  clusterColor: string
  relationshipCount: number
}

interface ClusterNodeData extends Record<string, unknown> {
  label: string
  tableCount: number
  color: string
}

// Cluster background node
function ClusterNode({ data }: { data: ClusterNodeData }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed transition-all"
      style={{
        backgroundColor: `${data.color}08`,
        borderColor: `${data.color}30`,
        width: '100%',
        height: '100%'
      }}
    >
      <div
        className="absolute -top-3 left-4 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase"
        style={{
          backgroundColor: `${data.color}20`,
          color: data.color
        }}
      >
        {data.label} · {data.tableCount} tables
      </div>
    </div>
  )
}

// Custom Table Node Component with enhanced styling
function TableNode({ data }: { data: TableNodeData }) {
  return (
    <div
      className={cn(
        'bg-card border rounded-lg shadow-lg min-w-[220px] overflow-hidden transition-all',
        data.isHub ? 'border-2 shadow-xl' : 'border'
      )}
      style={{
        borderColor: data.isHub ? data.clusterColor : 'var(--border)'
      }}
    >
      {/* Table Header */}
      <div
        className="px-3 py-2.5 border-b"
        style={{
          background: data.isHub
            ? `linear-gradient(135deg, ${data.clusterColor}15, ${data.clusterColor}08)`
            : 'var(--muted)',
          borderColor: data.isHub ? `${data.clusterColor}30` : 'var(--border)'
        }}
      >
        <div className="flex items-center gap-2">
          {data.isHub && (
            <GitBranch className="size-3.5" style={{ color: data.clusterColor }} />
          )}
          <div className="flex-1">
            <div
              className={cn('font-semibold text-sm', data.isHub && 'font-bold')}
              style={{ color: data.isHub ? data.clusterColor : 'var(--foreground)' }}
            >
              {data.label}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span>{data.schemaName}</span>
              {data.relationshipCount > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span style={{ color: `${data.clusterColor}90` }}>
                    {data.relationshipCount} relation{data.relationshipCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="py-1 max-h-[300px] overflow-y-auto">
        {data.columns.map((column) => (
          <div
            key={column.name}
            className="relative flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            {/* Source handle for FK columns */}
            {column.foreignKey && (
              <Handle
                type="source"
                position={Position.Right}
                id={`${column.name}-source`}
                className="!w-2.5 !h-2.5 !border-2 !border-background"
                style={{ backgroundColor: data.clusterColor }}
              />
            )}

            {/* Target handle for PK columns */}
            {column.isPrimaryKey && (
              <Handle
                type="target"
                position={Position.Left}
                id={`${column.name}-target`}
                className="!bg-amber-500 !w-2.5 !h-2.5 !border-2 !border-background"
              />
            )}

            {column.isPrimaryKey ? (
              <Key className="size-3.5 text-amber-500 shrink-0" />
            ) : column.foreignKey ? (
              <Key className="size-3.5 shrink-0" style={{ color: data.clusterColor }} />
            ) : (
              <Columns3 className="size-3.5 text-muted-foreground/60 shrink-0" />
            )}

            <span className={cn('flex-1 truncate', column.isPrimaryKey && 'font-medium')}>
              {column.name}
            </span>

            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {column.dataType}
            </span>

            {!column.isNullable && !column.isPrimaryKey && (
              <span className="text-red-400/80 text-[10px] font-bold">*</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const nodeTypes = {
  tableNode: TableNode,
  clusterNode: ClusterNode
}

interface ERDVisualizationProps {
  schemas: SchemaInfo[]
}

// Cluster color palette - distinctive, accessible colors
const CLUSTER_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#84cc16' // Lime
]

// Graph utilities for relationship-based layout
interface TableGraph {
  nodes: Set<string>
  edges: Map<string, Set<string>>
  edgeCounts: Map<string, number>
}

function buildRelationshipGraph(schemas: SchemaInfo[]): TableGraph {
  const nodes = new Set<string>()
  const edges = new Map<string, Set<string>>()
  const edgeCounts = new Map<string, number>()

  // Add all tables as nodes
  schemas.forEach((schema) => {
    schema.tables.forEach((table) => {
      const tableKey = `${schema.name}.${table.name}`
      nodes.add(tableKey)
      edges.set(tableKey, new Set())
      edgeCounts.set(tableKey, 0)
    })
  })

  // Add edges for foreign key relationships (bidirectional for clustering)
  schemas.forEach((schema) => {
    schema.tables.forEach((table) => {
      const sourceKey = `${schema.name}.${table.name}`
      table.columns.forEach((column) => {
        if (column.foreignKey) {
          const targetKey = `${column.foreignKey.referencedSchema}.${column.foreignKey.referencedTable}`
          if (nodes.has(targetKey)) {
            edges.get(sourceKey)?.add(targetKey)
            edges.get(targetKey)?.add(sourceKey)
            edgeCounts.set(sourceKey, (edgeCounts.get(sourceKey) || 0) + 1)
            edgeCounts.set(targetKey, (edgeCounts.get(targetKey) || 0) + 1)
          }
        }
      })
    })
  })

  return { nodes, edges, edgeCounts }
}

function findConnectedComponents(graph: TableGraph): string[][] {
  const visited = new Set<string>()
  const components: string[][] = []

  function dfs(node: string, component: string[]) {
    if (visited.has(node)) return
    visited.add(node)
    component.push(node)
    graph.edges.get(node)?.forEach((neighbor) => {
      dfs(neighbor, component)
    })
  }

  graph.nodes.forEach((node) => {
    if (!visited.has(node)) {
      const component: string[] = []
      dfs(node, component)
      components.push(component)
    }
  })

  // Sort components by size (largest first), then by edge count
  return components.sort((a, b) => {
    const aEdges = a.reduce((sum, n) => sum + (graph.edgeCounts.get(n) || 0), 0)
    const bEdges = b.reduce((sum, n) => sum + (graph.edgeCounts.get(n) || 0), 0)
    if (a.length !== b.length) return b.length - a.length
    return bEdges - aEdges
  })
}

function findHubTable(component: string[], edgeCounts: Map<string, number>): string {
  // Hub is the table with most relationships
  return component.reduce((hub, table) => {
    const hubCount = edgeCounts.get(hub) || 0
    const tableCount = edgeCounts.get(table) || 0
    return tableCount > hubCount ? table : hub
  }, component[0])
}

interface ClusterLayout {
  tables: Map<string, { x: number; y: number }>
  bounds: { x: number; y: number; width: number; height: number }
  hub: string
}

function layoutCluster(
  component: string[],
  graph: TableGraph,
  tableHeights: Map<string, number>
): ClusterLayout {
  const positions = new Map<string, { x: number; y: number }>()
  const hub = findHubTable(component, graph.edgeCounts)

  if (component.length === 1) {
    // Single table cluster
    positions.set(component[0], { x: 0, y: 0 })
    const height = tableHeights.get(component[0]) || 200
    return {
      tables: positions,
      bounds: { x: 0, y: 0, width: 280, height: height + 40 },
      hub
    }
  }

  // Radial layout with hub at center
  const TABLE_WIDTH = 260
  const RADIAL_SPACING = 320
  const VERTICAL_SPACING = 80

  // Place hub at center
  positions.set(hub, { x: 0, y: 0 })

  // Get directly connected tables first
  const directlyConnected = Array.from(graph.edges.get(hub) || []).filter((t) =>
    component.includes(t)
  )
  const otherTables = component.filter((t) => t !== hub && !directlyConnected.includes(t))

  // Layout directly connected tables in a radial pattern around hub
  if (directlyConnected.length <= 4) {
    // Cardinal positions for up to 4 tables
    const cardinalPositions = [
      { x: 0, y: -RADIAL_SPACING }, // Top
      { x: RADIAL_SPACING, y: 0 }, // Right
      { x: 0, y: RADIAL_SPACING }, // Bottom
      { x: -RADIAL_SPACING, y: 0 } // Left
    ]
    directlyConnected.forEach((table, i) => {
      positions.set(table, cardinalPositions[i])
    })
  } else {
    // Circular layout for more tables
    const angleStep = (2 * Math.PI) / directlyConnected.length
    directlyConnected.forEach((table, i) => {
      const angle = i * angleStep - Math.PI / 2 // Start from top
      positions.set(table, {
        x: Math.cos(angle) * RADIAL_SPACING,
        y: Math.sin(angle) * RADIAL_SPACING
      })
    })
  }

  // Place remaining tables in outer ring
  if (otherTables.length > 0) {
    const outerRadius = RADIAL_SPACING * 1.8
    const angleStep = (2 * Math.PI) / otherTables.length
    otherTables.forEach((table, i) => {
      const angle = i * angleStep + (Math.PI / otherTables.length) // Offset to avoid overlap
      positions.set(table, {
        x: Math.cos(angle) * outerRadius,
        y: Math.sin(angle) * outerRadius
      })
    })
  }

  // Calculate bounds
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  positions.forEach((pos, table) => {
    const height = tableHeights.get(table) || 200
    minX = Math.min(minX, pos.x)
    maxX = Math.max(maxX, pos.x + TABLE_WIDTH)
    minY = Math.min(minY, pos.y)
    maxY = Math.max(maxY, pos.y + height)
  })

  const padding = 60
  return {
    tables: positions,
    bounds: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + TABLE_WIDTH + padding * 2,
      height: maxY - minY + padding * 2 + VERTICAL_SPACING
    },
    hub
  }
}

export function ERDVisualization({ schemas }: ERDVisualizationProps) {
  // Filter state
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [tableFilterOpen, setTableFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Get all available tables for the filter
  const allTables = useMemo(() => {
    const tables: { key: string; schema: string; table: string }[] = []
    schemas.forEach((schema) => {
      schema.tables.forEach((table) => {
        tables.push({
          key: `${schema.name}.${table.name}`,
          schema: schema.name,
          table: table.name
        })
      })
    })
    return tables.sort((a, b) => a.key.localeCompare(b.key))
  }, [schemas])

  // Filter schemas based on selection
  const filteredSchemas = useMemo(() => {
    if (selectedTables.size === 0) {
      return schemas // Show all if nothing selected
    }

    return schemas
      .map((schema) => ({
        ...schema,
        tables: schema.tables.filter((table) => selectedTables.has(`${schema.name}.${table.name}`))
      }))
      .filter((schema) => schema.tables.length > 0)
  }, [schemas, selectedTables])

  // Filter tables shown in dropdown based on search
  const filteredTableOptions = useMemo(() => {
    if (!searchQuery) return allTables
    const query = searchQuery.toLowerCase()
    return allTables.filter(
      (t) => t.table.toLowerCase().includes(query) || t.schema.toLowerCase().includes(query)
    )
  }, [allTables, searchQuery])

  // Toggle table selection
  const toggleTable = (tableKey: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableKey)) {
        next.delete(tableKey)
      } else {
        next.add(tableKey)
      }
      return next
    })
  }

  // Select all tables in a schema
  const selectSchema = (schemaName: string) => {
    const schemaTables = allTables.filter((t) => t.schema === schemaName)
    setSelectedTables((prev) => {
      const next = new Set(prev)
      schemaTables.forEach((t) => next.add(t.key))
      return next
    })
  }

  // Clear all selections
  const clearSelection = () => {
    setSelectedTables(new Set())
  }

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node<TableNodeData | ClusterNodeData>[] = []
    const edges: Edge[] = []

    // Build relationship graph
    const graph = buildRelationshipGraph(filteredSchemas)

    // Calculate table heights
    const tableHeights = new Map<string, number>()
    const tableDataMap = new Map<
      string,
      { schemaName: string; columns: ColumnInfo[]; tableName: string }
    >()

    filteredSchemas.forEach((schema) => {
      schema.tables.forEach((table) => {
        const key = `${schema.name}.${table.name}`
        const height = 70 + Math.min(table.columns.length, 12) * 28 // Cap visible columns
        tableHeights.set(key, height)
        tableDataMap.set(key, {
          schemaName: schema.name,
          tableName: table.name,
          columns: table.columns
        })
      })
    })

    // Find connected components (clusters)
    const components = findConnectedComponents(graph)

    // Layout each cluster
    const clusterLayouts: { layout: ClusterLayout; component: string[]; colorIndex: number }[] = []

    components.forEach((component, index) => {
      const layout = layoutCluster(component, graph, tableHeights)
      clusterLayouts.push({
        layout,
        component,
        colorIndex: index % CLUSTER_COLORS.length
      })
    })

    // Position clusters in a grid
    const CLUSTER_GAP = 150
    let currentX = 0
    let currentY = 0
    let rowMaxHeight = 0
    let clustersInRow = 0
    const MAX_CLUSTERS_PER_ROW = 3
    const clusterOffsets = new Map<number, { x: number; y: number }>()

    clusterLayouts.forEach((cluster, index) => {
      const { bounds } = cluster.layout

      if (clustersInRow >= MAX_CLUSTERS_PER_ROW) {
        currentX = 0
        currentY += rowMaxHeight + CLUSTER_GAP
        rowMaxHeight = 0
        clustersInRow = 0
      }

      clusterOffsets.set(index, { x: currentX - bounds.x, y: currentY - bounds.y })
      currentX += bounds.width + CLUSTER_GAP
      rowMaxHeight = Math.max(rowMaxHeight, bounds.height)
      clustersInRow++
    })

    // Create nodes for each table with cluster-aware positioning
    clusterLayouts.forEach((cluster, clusterIndex) => {
      const { layout, component } = cluster
      const color = CLUSTER_COLORS[cluster.colorIndex]
      const offset = clusterOffsets.get(clusterIndex)!

      // Add cluster background node for multi-table clusters
      if (component.length > 1) {
        const bounds = layout.bounds
        nodes.push({
          id: `cluster-${clusterIndex}`,
          type: 'clusterNode',
          position: { x: bounds.x + offset.x, y: bounds.y + offset.y },
          data: {
            label: `Cluster ${clusterIndex + 1}`,
            tableCount: component.length,
            color
          },
          style: {
            width: bounds.width,
            height: bounds.height,
            zIndex: -1
          },
          selectable: false,
          draggable: false
        })
      }

      // Add table nodes
      component.forEach((tableKey) => {
        const pos = layout.tables.get(tableKey)!
        const tableData = tableDataMap.get(tableKey)!
        const relationshipCount = graph.edgeCounts.get(tableKey) || 0
        const isHub = tableKey === layout.hub && component.length > 1

        nodes.push({
          id: tableKey,
          type: 'tableNode',
          position: { x: pos.x + offset.x, y: pos.y + offset.y },
          data: {
            label: tableData.tableName,
            schemaName: tableData.schemaName,
            columns: tableData.columns,
            isHub,
            clusterColor: color,
            relationshipCount
          },
          zIndex: 1
        })
      })
    })

    // Create edges for foreign keys
    filteredSchemas.forEach((schema) => {
      schema.tables.forEach((table) => {
        const sourceTableKey = `${schema.name}.${table.name}`

        table.columns.forEach((column) => {
          if (column.foreignKey) {
            const targetTableKey = `${column.foreignKey.referencedSchema}.${column.foreignKey.referencedTable}`

            if (tableDataMap.has(targetTableKey)) {
              // Find cluster color for this edge
              const clusterIndex = clusterLayouts.findIndex((c) =>
                c.component.includes(sourceTableKey)
              )
              const edgeColor = clusterIndex >= 0 ? CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length] : '#6366f1'

              edges.push({
                id: `${sourceTableKey}.${column.name}->${targetTableKey}.${column.foreignKey.referencedColumn}`,
                source: sourceTableKey,
                sourceHandle: `${column.name}-source`,
                target: targetTableKey,
                targetHandle: `${column.foreignKey.referencedColumn}-target`,
                type: 'smoothstep',
                animated: false,
                style: {
                  stroke: edgeColor,
                  strokeWidth: 2,
                  opacity: 0.7
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: edgeColor,
                  width: 20,
                  height: 20
                },
                label: column.foreignKey.constraintName,
                labelStyle: { fontSize: 9, fill: '#888', fontWeight: 500 },
                labelBgStyle: {
                  fill: 'var(--background)',
                  fillOpacity: 0.9
                },
                labelBgPadding: [4, 2] as [number, number]
              })
            }
          }
        })
      })
    })

    return { initialNodes: nodes, initialEdges: edges }
  }, [filteredSchemas])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync React Flow state when filtered data changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onInit = useCallback(() => {
    // Could add fitView here if needed
  }, [])

  // Get unique schemas for grouping in filter
  const uniqueSchemas = useMemo(() => {
    return [...new Set(allTables.map((t) => t.schema))].sort()
  }, [allTables])

  if (schemas.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <GitBranch className="size-12 mx-auto opacity-20" />
          <p>No tables found to visualize</p>
        </div>
      </div>
    )
  }

  // Calculate stats for header
  const tableCount = initialNodes.filter((n) => n.type === 'tableNode').length
  const clusterCount = initialNodes.filter((n) => n.type === 'clusterNode').length
  const relationshipCount = initialEdges.length

  return (
    <div className="w-full h-full flex flex-col">
      {/* Stats bar with filter */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border/40 bg-muted/30 text-xs text-muted-foreground">
        {/* Table Filter */}
        <Popover open={tableFilterOpen} onOpenChange={setTableFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Filter className="size-3" />
              Filter Tables
              {selectedTables.size > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {selectedTables.size}
                </Badge>
              )}
              <ChevronsUpDown className="size-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2">
                {filteredTableOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No tables found.</p>
                ) : (
                  uniqueSchemas.map((schemaName) => {
                    const schemaTables = filteredTableOptions.filter((t) => t.schema === schemaName)
                    if (schemaTables.length === 0) return null
                    return (
                      <div key={schemaName} className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            {schemaName}
                          </span>
                          <button
                            onClick={() => selectSchema(schemaName)}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Select all
                          </button>
                        </div>
                        <div className="space-y-0.5">
                          {schemaTables.map((table) => (
                            <button
                              key={table.key}
                              onClick={() => toggleTable(table.key)}
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                            >
                              <div
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded-sm border border-primary shrink-0',
                                  selectedTables.has(table.key)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'opacity-50'
                                )}
                              >
                                {selectedTables.has(table.key) && <Check className="size-3" />}
                              </div>
                              <span className="truncate">{table.table}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
            {selectedTables.size > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={clearSelection}
                >
                  <X className="size-3 mr-1" />
                  Clear selection ({selectedTables.size})
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Selected tables badges */}
        {selectedTables.size > 0 && selectedTables.size <= 3 && (
          <div className="flex items-center gap-1">
            {Array.from(selectedTables).slice(0, 3).map((key) => (
              <Badge
                key={key}
                variant="secondary"
                className="h-5 text-[10px] gap-1 cursor-pointer hover:bg-secondary/80"
                onClick={() => toggleTable(key)}
              >
                {key.split('.')[1]}
                <X className="size-2.5" />
              </Badge>
            ))}
          </div>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Stats */}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary/60" />
          {tableCount} table{tableCount !== 1 ? 's' : ''}
          {selectedTables.size > 0 && (
            <span className="text-muted-foreground/60">
              (of {allTables.length})
            </span>
          )}
        </span>
        {clusterCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo-500/60" />
            {clusterCount + (tableCount - clusterCount > clusterCount ? tableCount - clusterCount - clusterCount : 0)} cluster{clusterCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500/60" />
          {relationshipCount} relationship{relationshipCount !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto opacity-70">
          Tables grouped by relationships • Hub tables centered
        </span>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
          minZoom={0.05}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep'
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#888" gap={24} size={1} />
          <Controls className="!bg-background/90 !border-border !rounded-lg !shadow-lg" />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'clusterNode') return 'transparent'
              const data = node.data as TableNodeData
              return data.clusterColor || 'var(--primary)'
            }}
            maskColor="rgba(0, 0, 0, 0.25)"
            className="!bg-background/80 !border-border !rounded-lg"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  )
}
