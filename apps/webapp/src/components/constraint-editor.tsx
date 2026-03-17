import { useState } from 'react'
import {
  Plus,
  Trash2,
  Key,
  Link2,
  CheckSquare,
  Fingerprint,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type {
  ConstraintDefinition,
  ConstraintType,
  ReferentialAction,
  ColumnDefinition,
  SchemaInfo
} from '@data-peek/shared'
import { cn } from '@/lib/utils'
import type { ValidationError } from '@/stores/ddl-store'

const CONSTRAINT_TYPES: { type: ConstraintType; label: string; icon: typeof Key }[] = [
  { type: 'primary_key', label: 'Primary Key', icon: Key },
  { type: 'foreign_key', label: 'Foreign Key', icon: Link2 },
  { type: 'unique', label: 'Unique', icon: Fingerprint },
  { type: 'check', label: 'Check', icon: CheckSquare }
]

const REFERENTIAL_ACTIONS: { value: ReferentialAction; label: string }[] = [
  { value: 'NO ACTION', label: 'No Action' },
  { value: 'RESTRICT', label: 'Restrict' },
  { value: 'CASCADE', label: 'Cascade' },
  { value: 'SET NULL', label: 'Set Null' },
  { value: 'SET DEFAULT', label: 'Set Default' }
]

interface ConstraintEditorProps {
  constraints: ConstraintDefinition[]
  columns: ColumnDefinition[]
  schemas: SchemaInfo[]
  validationErrors: ValidationError[]
  onAdd: (type: ConstraintType) => string
  onUpdate: (id: string, updates: Partial<ConstraintDefinition>) => void
  onRemove: (id: string) => void
  onSelect: (id: string | null) => void
  selectedId: string | null
}

export function ConstraintEditor({
  constraints,
  columns,
  schemas,
  validationErrors,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
  selectedId
}: ConstraintEditorProps) {
  const [expandedConstraints, setExpandedConstraints] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedConstraints((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAddConstraint = (type: ConstraintType) => {
    const id = onAdd(type)
    setExpandedConstraints((prev) => new Set(prev).add(id))
  }

  const getConstraintIcon = (type: ConstraintType) => {
    const config = CONSTRAINT_TYPES.find((t) => t.type === type)
    return config?.icon ?? Key
  }

  const getConstraintLabel = (type: ConstraintType) => {
    const config = CONSTRAINT_TYPES.find((t) => t.type === type)
    return config?.label ?? type
  }

  const getConstraintErrors = (constraintId: string) => {
    return validationErrors.filter((e) => e.field.startsWith(`constraint.${constraintId}`))
  }

  // Get all tables from all schemas for FK reference
  const allTables = schemas.flatMap((schema) =>
    schema.tables
      .filter((t) => t.type === 'table')
      .map((table) => ({
        schema: schema.name,
        table: table.name,
        columns: table.columns
      }))
  )

  return (
    <div className="space-y-2">
      {constraints.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground border border-dashed border-border/40 rounded-lg">
          <p className="text-sm">No constraints defined.</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                <Plus className="size-3.5" />
                Add Constraint
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {CONSTRAINT_TYPES.map(({ type, label, icon: Icon }) => (
                <DropdownMenuItem key={type} onClick={() => handleAddConstraint(type)}>
                  <Icon className="size-4 mr-2" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <>
          {constraints.map((constraint) => {
            const Icon = getConstraintIcon(constraint.type)
            const errors = getConstraintErrors(constraint.id)
            const isExpanded = expandedConstraints.has(constraint.id)
            const isSelected = selectedId === constraint.id

            return (
              <Collapsible
                key={constraint.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(constraint.id)}
              >
                <div
                  className={cn(
                    'rounded-lg border border-border/40',
                    isSelected && 'ring-1 ring-primary',
                    errors.length > 0 && 'border-destructive/50'
                  )}
                  onClick={() => onSelect(constraint.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50">
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {constraint.name || getConstraintLabel(constraint.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({constraint.columns.length} column
                        {constraint.columns.length !== 1 ? 's' : ''})
                      </span>
                      {errors.length > 0 && (
                        <AlertCircle className="size-4 text-destructive ml-auto" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 ml-auto text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(constraint.id)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/40 p-3 space-y-3">
                      {/* Constraint Name */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">Name</label>
                        <Input
                          value={constraint.name ?? ''}
                          onChange={(e) =>
                            onUpdate(constraint.id, { name: e.target.value || undefined })
                          }
                          placeholder="Auto-generated"
                          className="h-8 font-mono text-sm"
                        />
                      </div>

                      {/* Columns */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                        <label className="text-sm text-muted-foreground pt-2">Columns</label>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {columns.map((col) => {
                              const isSelected = constraint.columns.includes(col.name)
                              return (
                                <Button
                                  key={col.id}
                                  variant={isSelected ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    const newColumns = isSelected
                                      ? constraint.columns.filter((c) => c !== col.name)
                                      : [...constraint.columns, col.name]
                                    onUpdate(constraint.id, { columns: newColumns })
                                  }}
                                >
                                  {col.name}
                                </Button>
                              )
                            })}
                          </div>
                          {constraint.columns.length === 0 && (
                            <p className="text-xs text-destructive">Select at least one column</p>
                          )}
                        </div>
                      </div>

                      {/* Foreign Key specific fields */}
                      {constraint.type === 'foreign_key' && (
                        <ForeignKeyFields
                          constraint={constraint}
                          allTables={allTables}
                          onUpdate={(updates) => onUpdate(constraint.id, updates)}
                        />
                      )}

                      {/* Check constraint expression */}
                      {constraint.type === 'check' && (
                        <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                          <label className="text-sm text-muted-foreground">Expression</label>
                          <Input
                            value={constraint.checkExpression ?? ''}
                            onChange={(e) =>
                              onUpdate(constraint.id, { checkExpression: e.target.value })
                            }
                            placeholder="e.g., price > 0"
                            className="h-8 font-mono text-sm"
                          />
                        </div>
                      )}

                      {/* Validation errors */}
                      {errors.length > 0 && (
                        <div className="text-xs text-destructive space-y-1">
                          {errors.map((err, i) => (
                            <p key={i}>{err.message}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )
          })}

          {/* Add constraint button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                <Plus className="size-3.5" />
                Add Constraint
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {CONSTRAINT_TYPES.map(({ type, label, icon: Icon }) => (
                <DropdownMenuItem key={type} onClick={() => handleAddConstraint(type)}>
                  <Icon className="size-4 mr-2" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )
}

// Foreign Key specific fields component
interface ForeignKeyFieldsProps {
  constraint: ConstraintDefinition
  allTables: Array<{
    schema: string
    table: string
    columns: Array<{ name: string; dataType: string }>
  }>
  onUpdate: (updates: Partial<ConstraintDefinition>) => void
}

function ForeignKeyFields({ constraint, allTables, onUpdate }: ForeignKeyFieldsProps) {
  const selectedTable = allTables.find(
    (t) => t.schema === constraint.referencedSchema && t.table === constraint.referencedTable
  )

  const tableOptions = allTables.map((t) => ({
    value: `${t.schema}.${t.table}`,
    label: t.schema === 'public' ? t.table : `${t.schema}.${t.table}`
  }))

  const handleTableChange = (value: string) => {
    const [schema, table] = value.split('.')
    onUpdate({
      referencedSchema: schema,
      referencedTable: table,
      referencedColumns: [] // Reset columns when table changes
    })
  }

  return (
    <>
      {/* Referenced Table */}
      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
        <label className="text-sm text-muted-foreground">References</label>
        <Select
          value={
            constraint.referencedSchema && constraint.referencedTable
              ? `${constraint.referencedSchema}.${constraint.referencedTable}`
              : ''
          }
          onValueChange={handleTableChange}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select table" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {tableOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Referenced Columns */}
      {selectedTable && (
        <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
          <label className="text-sm text-muted-foreground pt-2">Ref. Columns</label>
          <div className="flex flex-wrap gap-2">
            {selectedTable.columns.map((col) => {
              const isSelected = constraint.referencedColumns?.includes(col.name) ?? false
              return (
                <Button
                  key={col.name}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const current = constraint.referencedColumns ?? []
                    const newColumns = isSelected
                      ? current.filter((c) => c !== col.name)
                      : [...current, col.name]
                    onUpdate({ referencedColumns: newColumns })
                  }}
                >
                  {col.name}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {/* ON UPDATE */}
      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
        <label className="text-sm text-muted-foreground">On Update</label>
        <Select
          value={constraint.onUpdate ?? 'NO ACTION'}
          onValueChange={(v) => onUpdate({ onUpdate: v as ReferentialAction })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFERENTIAL_ACTIONS.map((action) => (
              <SelectItem key={action.value} value={action.value}>
                {action.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ON DELETE */}
      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
        <label className="text-sm text-muted-foreground">On Delete</label>
        <Select
          value={constraint.onDelete ?? 'NO ACTION'}
          onValueChange={(v) => onUpdate({ onDelete: v as ReferentialAction })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFERENTIAL_ACTIONS.map((action) => (
              <SelectItem key={action.value} value={action.value}>
                {action.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
