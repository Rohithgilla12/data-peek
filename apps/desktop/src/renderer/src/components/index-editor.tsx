import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, AlertCircle, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { IndexDefinition, IndexColumn, IndexMethod, ColumnDefinition } from '@data-peek/shared'
import { cn } from '@/lib/utils'
import type { ValidationError } from '@/stores/ddl-store'

const INDEX_METHODS: { value: IndexMethod; label: string; description: string }[] = [
  { value: 'btree', label: 'B-tree', description: 'Default, good for equality and range queries' },
  { value: 'hash', label: 'Hash', description: 'Fast for equality comparisons only' },
  { value: 'gin', label: 'GIN', description: 'For arrays, JSONB, full-text search' },
  { value: 'gist', label: 'GiST', description: 'For geometric, range, and full-text data' },
  { value: 'spgist', label: 'SP-GiST', description: 'Space-partitioned GiST' },
  { value: 'brin', label: 'BRIN', description: 'For large sorted tables' }
]

interface IndexEditorProps {
  indexes: IndexDefinition[]
  columns: ColumnDefinition[]
  validationErrors: ValidationError[]
  onAdd: () => string
  onUpdate: (id: string, updates: Partial<IndexDefinition>) => void
  onRemove: (id: string) => void
  onSelect: (id: string | null) => void
  selectedId: string | null
}

export function IndexEditor({
  indexes,
  columns,
  validationErrors,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
  selectedId
}: IndexEditorProps) {
  const [expandedIndexes, setExpandedIndexes] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAddIndex = () => {
    const id = onAdd()
    setExpandedIndexes((prev) => new Set(prev).add(id))
  }

  const getIndexErrors = (indexId: string) => {
    return validationErrors.filter((e) => e.field.startsWith(`index.${indexId}`))
  }

  const updateIndexColumn = (
    indexId: string,
    index: IndexDefinition,
    columnIndex: number,
    updates: Partial<IndexColumn>
  ) => {
    const newColumns = [...index.columns]
    newColumns[columnIndex] = { ...newColumns[columnIndex], ...updates }
    onUpdate(indexId, { columns: newColumns })
  }

  const addColumnToIndex = (indexId: string, index: IndexDefinition, columnName: string) => {
    const newColumn: IndexColumn = { name: columnName, order: 'ASC' }
    onUpdate(indexId, { columns: [...index.columns, newColumn] })
  }

  const removeColumnFromIndex = (indexId: string, index: IndexDefinition, columnIndex: number) => {
    const newColumns = index.columns.filter((_, i) => i !== columnIndex)
    onUpdate(indexId, { columns: newColumns })
  }

  // Get columns not yet in the index
  const getAvailableColumns = (index: IndexDefinition) => {
    const usedColumns = new Set(index.columns.map((c) => c.name))
    return columns.filter((c) => !usedColumns.has(c.name))
  }

  return (
    <div className="space-y-2">
      {indexes.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground border border-dashed border-border/40 rounded-lg">
          <p className="text-sm">No indexes defined.</p>
          <p className="text-xs mt-1">Primary key indexes are created automatically.</p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={handleAddIndex}>
            <Plus className="size-3.5" />
            Add Index
          </Button>
        </div>
      ) : (
        <>
          {indexes.map((index) => {
            const errors = getIndexErrors(index.id)
            const isExpanded = expandedIndexes.has(index.id)
            const isSelected = selectedId === index.id
            const availableColumns = getAvailableColumns(index)

            return (
              <Collapsible
                key={index.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(index.id)}
              >
                <div
                  className={cn(
                    'rounded-lg border border-border/40',
                    isSelected && 'ring-1 ring-primary',
                    errors.length > 0 && 'border-destructive/50'
                  )}
                  onClick={() => onSelect(index.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50">
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <Database className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {index.name ||
                          `Index on (${index.columns.map((c) => c.name).join(', ') || '...'})`}
                      </span>
                      {index.isUnique && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          UNIQUE
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto mr-2">
                        {index.method ?? 'btree'}
                      </span>
                      {errors.length > 0 && <AlertCircle className="size-4 text-destructive" />}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(index.id)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/40 p-3 space-y-3">
                      {/* Index Name */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">Name</label>
                        <Input
                          value={index.name ?? ''}
                          onChange={(e) =>
                            onUpdate(index.id, { name: e.target.value || undefined })
                          }
                          placeholder="Auto-generated"
                          className="h-8 font-mono text-sm"
                        />
                      </div>

                      {/* Index Method */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">Method</label>
                        <Select
                          value={index.method ?? 'btree'}
                          onValueChange={(v) => onUpdate(index.id, { method: v as IndexMethod })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INDEX_METHODS.map((method) => (
                              <SelectItem key={method.value} value={method.value}>
                                <div className="flex flex-col">
                                  <span>{method.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {method.description}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Unique */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">Unique</label>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={index.isUnique}
                            onCheckedChange={(checked) =>
                              onUpdate(index.id, { isUnique: checked as boolean })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            Enforce unique values
                          </span>
                        </div>
                      </div>

                      {/* Columns */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                        <label className="text-sm text-muted-foreground pt-2">Columns</label>
                        <div className="space-y-2">
                          {index.columns.length === 0 ? (
                            <p className="text-xs text-destructive">Add at least one column</p>
                          ) : (
                            <div className="space-y-1">
                              {index.columns.map((col, colIdx) => (
                                <div
                                  key={colIdx}
                                  className="flex items-center gap-2 p-2 rounded bg-muted/30"
                                >
                                  <span className="text-sm font-mono flex-1">{col.name}</span>
                                  <Select
                                    value={col.order ?? 'ASC'}
                                    onValueChange={(v) =>
                                      updateIndexColumn(index.id, index, colIdx, {
                                        order: v as 'ASC' | 'DESC'
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-20">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ASC">ASC</SelectItem>
                                      <SelectItem value="DESC">DESC</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={col.nullsPosition ?? 'default'}
                                    onValueChange={(v) =>
                                      updateIndexColumn(index.id, index, colIdx, {
                                        nullsPosition:
                                          v === 'default' ? undefined : (v as 'FIRST' | 'LAST')
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="default">NULLS default</SelectItem>
                                      <SelectItem value="FIRST">NULLS FIRST</SelectItem>
                                      <SelectItem value="LAST">NULLS LAST</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => removeColumnFromIndex(index.id, index, colIdx)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add column dropdown */}
                          {availableColumns.length > 0 && (
                            <Select
                              value=""
                              onValueChange={(v) => addColumnToIndex(index.id, index, v)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Plus className="size-3.5" />
                                  <span>Add column</span>
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                {availableColumns.map((col) => (
                                  <SelectItem key={col.id} value={col.name}>
                                    {col.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>

                      {/* WHERE clause (partial index) */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">WHERE</label>
                        <Input
                          value={index.where ?? ''}
                          onChange={(e) =>
                            onUpdate(index.id, { where: e.target.value || undefined })
                          }
                          placeholder="Partial index condition (optional)"
                          className="h-8 font-mono text-sm"
                        />
                      </div>

                      {/* INCLUDE columns */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                        <label className="text-sm text-muted-foreground pt-2">Include</label>
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Additional columns stored in index (covering index)
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {columns
                              .filter((c) => !index.columns.some((ic) => ic.name === c.name))
                              .map((col) => {
                                const isIncluded = index.include?.includes(col.name) ?? false
                                return (
                                  <Button
                                    key={col.id}
                                    variant={isIncluded ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      const current = index.include ?? []
                                      const newInclude = isIncluded
                                        ? current.filter((c) => c !== col.name)
                                        : [...current, col.name]
                                      onUpdate(index.id, {
                                        include: newInclude.length > 0 ? newInclude : undefined
                                      })
                                    }}
                                  >
                                    {col.name}
                                  </Button>
                                )
                              })}
                          </div>
                        </div>
                      </div>

                      {/* Concurrent */}
                      <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                        <label className="text-sm text-muted-foreground">Concurrent</label>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={index.concurrent ?? false}
                            onCheckedChange={(checked) =>
                              onUpdate(index.id, { concurrent: checked as boolean })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            Create index without locking writes
                          </span>
                        </div>
                      </div>

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

          {/* Add index button */}
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleAddIndex}>
            <Plus className="size-3.5" />
            Add Index
          </Button>
        </>
      )}
    </div>
  )
}
