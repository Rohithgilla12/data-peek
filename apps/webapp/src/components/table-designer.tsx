import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Trash2,
  Save,
  X,
  Code,
  Loader2,
  AlertCircle,
  GripVertical,
  Copy,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTabStore, useConnectionStore } from '@/stores'
import { useDDLStore, type ValidationError } from '@/stores/ddl-store'
import type { TableDesignerTab } from '@/stores/tab-store'
import type { ColumnDefinition, PostgresDataType, ConstraintType } from '@data-peek/shared'
import { cn } from '@/lib/utils'
import { ConstraintEditor } from '@/components/constraint-editor'
import { IndexEditor } from '@/components/index-editor'

// PostgreSQL data types grouped by category
const DATA_TYPE_GROUPS = {
  Numeric: [
    'smallint',
    'integer',
    'bigint',
    'serial',
    'bigserial',
    'numeric',
    'real',
    'double precision',
    'money'
  ],
  Text: ['char', 'varchar', 'text'],
  Binary: ['bytea'],
  'Date/Time': ['timestamp', 'timestamptz', 'date', 'time', 'timetz', 'interval'],
  Boolean: ['boolean'],
  UUID: ['uuid'],
  JSON: ['json', 'jsonb'],
  XML: ['xml'],
  Geometric: ['point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle'],
  Network: ['cidr', 'inet', 'macaddr'],
  Range: ['int4range', 'int8range', 'numrange', 'tsrange', 'tstzrange', 'daterange']
} as const

interface TableDesignerProps {
  tabId: string
}

export function TableDesigner({ tabId }: TableDesignerProps) {
  const tab = useTabStore((s) => s.getTab(tabId)) as TableDesignerTab | undefined
  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const fetchSchemas = useConnectionStore((s) => s.fetchSchemas)

  const {
    initTableDesigner,
    loadTableDefinition,
    cleanupTab,
    getState,
    getDefinition,
    isDirty,
    validate,
    setTableName,
    setTableSchema,
    addColumn,
    updateColumn,
    removeColumn,
    duplicateColumn,
    selectColumn,
    addConstraint,
    updateConstraint,
    removeConstraint,
    selectConstraint,
    addIndex,
    updateIndex,
    removeIndex,
    selectIndex,
    setLoading,
    setSaving,
    setError,
    setSqlPreview
  } = useDDLStore()

  const state = getState(tabId)
  const definition = getDefinition(tabId)
  const dirty = isDirty(tabId)

  const [expandedSections, setExpandedSections] = useState({
    columns: true,
    constraints: false,
    indexes: false
  })

  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(false)
  const [previewSql, setPreviewSql] = useState<string>('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  const tabConnection = tab?.connectionId
    ? connections.find((c) => c.id === tab.connectionId)
    : null

  // Initialize the store state on mount
  useEffect(() => {
    if (tab && !state) {
      initTableDesigner(tabId, tab.schemaName, tab.tableName)
    }
  }, [tab, state, tabId, initTableDesigner])

  // Load existing table definition when editing
  useEffect(() => {
    const loadExistingTable = async () => {
      if (!tab || !tabConnection || tab.mode !== 'edit' || !tab.tableName) return
      if (!state?.isLoading) return

      try {
        const response = await window.api.ddl.getTableDDL(
          tabConnection,
          tab.schemaName,
          tab.tableName
        )

        if (response.success && response.data) {
          loadTableDefinition(tabId, response.data)
        } else {
          setError(tabId, response.error ?? 'Failed to load table definition')
          setLoading(tabId, false)
        }
      } catch (err) {
        setError(tabId, err instanceof Error ? err.message : String(err))
        setLoading(tabId, false)
      }
    }

    loadExistingTable()
  }, [tab, tabConnection, state?.isLoading, tabId, loadTableDefinition, setError, setLoading])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTab(tabId)
    }
  }, [tabId, cleanupTab])

  const handleAddColumn = useCallback(() => {
    addColumn(tabId)
  }, [tabId, addColumn])

  const handleRemoveColumn = useCallback(
    (columnId: string) => {
      removeColumn(tabId, columnId)
    },
    [tabId, removeColumn]
  )

  const handleDuplicateColumn = useCallback(
    (columnId: string) => {
      duplicateColumn(tabId, columnId)
    },
    [tabId, duplicateColumn]
  )

  const handleColumnChange = useCallback(
    (columnId: string, field: keyof ColumnDefinition, value: unknown) => {
      updateColumn(tabId, columnId, { [field]: value })
    },
    [tabId, updateColumn]
  )

  const handlePreviewSQL = useCallback(async () => {
    if (!definition) return

    // Validate first
    const errors = validate(tabId)
    if (errors.some((e) => e.severity === 'error')) {
      return
    }

    setIsPreviewLoading(true)
    try {
      const response = await window.api.ddl.previewDDL(definition)
      if (response.success && response.data) {
        setPreviewSql(response.data)
        setSqlPreview(tabId, response.data)
        setSqlPreviewOpen(true)
      } else {
        setError(tabId, response.error ?? 'Failed to generate SQL')
      }
    } catch (err) {
      setError(tabId, err instanceof Error ? err.message : String(err))
    } finally {
      setIsPreviewLoading(false)
    }
  }, [definition, tabId, validate, setSqlPreview, setError])

  const handleSave = useCallback(async () => {
    if (!definition || !tabConnection) return

    // Validate
    const errors = validate(tabId)
    if (errors.some((e) => e.severity === 'error')) {
      return
    }

    setSaving(tabId, true)
    setError(tabId, null)

    try {
      const response = await window.api.ddl.createTable(tabConnection, definition)

      if (response.success) {
        // Refresh schemas to show the new table
        await fetchSchemas(tabConnection.id)
        // Close the tab or show success
        setError(tabId, null)
      } else {
        setError(tabId, response.error ?? 'Failed to create table')
      }
    } catch (err) {
      setError(tabId, err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(tabId, false)
    }
  }, [definition, tabConnection, tabId, validate, setSaving, setError, fetchSchemas])

  // Get available schema names
  const availableSchemas = schemas.map((s) => s.name)

  if (!tab) return null

  if (!tabConnection) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="size-12 text-muted-foreground mx-auto" />
          <div>
            <h2 className="text-lg font-medium">No Connection</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This tab&apos;s connection is no longer available.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (state?.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="size-12 text-muted-foreground mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground">Loading table definition...</p>
        </div>
      </div>
    )
  }

  if (!definition) return null

  const validationErrors = state?.validationErrors ?? []
  const hasErrors = validationErrors.some((e) => e.severity === 'error')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Select value={definition.schema} onValueChange={(v) => setTableSchema(tabId, v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Schema" />
              </SelectTrigger>
              <SelectContent>
                {availableSchemas.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">.</span>
            <Input
              value={definition.name}
              onChange={(e) => setTableName(tabId, e.target.value)}
              placeholder="table_name"
              className="h-8 w-48 font-mono"
            />
          </div>
          {dirty && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewSQL}
            disabled={isPreviewLoading || hasErrors}
            className="gap-1.5"
          >
            {isPreviewLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Code className="size-3.5" />
            )}
            Preview SQL
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={state?.isSaving || hasErrors || !dirty}
            className="gap-1.5"
          >
            {state?.isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {tab.mode === 'create' ? 'Create Table' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Error display */}
      {state?.error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0"
            onClick={() => setError(tabId, null)}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Main content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Columns Section */}
          <Collapsible
            open={expandedSections.columns}
            onOpenChange={(open) => setExpandedSections((s) => ({ ...s, columns: open }))}
          >
            <div className="rounded-lg border border-border/40">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  {expandedSections.columns ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="font-medium">Columns</span>
                  <span className="text-xs text-muted-foreground">
                    ({definition.columns.length})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddColumn()
                  }}
                >
                  <Plus className="size-3.5" />
                  Add Column
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border/40">
                  {definition.columns.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p>No columns defined yet.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-1.5"
                        onClick={handleAddColumn}
                      >
                        <Plus className="size-3.5" />
                        Add your first column
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {/* Column header */}
                      <div className="grid grid-cols-[32px_1fr_160px_80px_80px_80px_1fr_40px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                        <div></div>
                        <div>Name</div>
                        <div>Type</div>
                        <div className="text-center">PK</div>
                        <div className="text-center">NOT NULL</div>
                        <div className="text-center">Unique</div>
                        <div>Default</div>
                        <div></div>
                      </div>
                      {/* Column rows */}
                      {definition.columns.map((col) => (
                        <ColumnRow
                          key={col.id}
                          column={col}
                          isSelected={state?.selectedColumnId === col.id}
                          validationErrors={validationErrors.filter((e) =>
                            e.field.startsWith(`column.${col.id}`)
                          )}
                          onSelect={() => selectColumn(tabId, col.id)}
                          onChange={(field, value) => handleColumnChange(col.id, field, value)}
                          onRemove={() => handleRemoveColumn(col.id)}
                          onDuplicate={() => handleDuplicateColumn(col.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Constraints Section */}
          <Collapsible
            open={expandedSections.constraints}
            onOpenChange={(open) => setExpandedSections((s) => ({ ...s, constraints: open }))}
          >
            <div className="rounded-lg border border-border/40">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  {expandedSections.constraints ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="font-medium">Constraints</span>
                  <span className="text-xs text-muted-foreground">
                    ({definition.constraints.length})
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border/40 p-3">
                  <ConstraintEditor
                    constraints={definition.constraints}
                    columns={definition.columns}
                    schemas={schemas}
                    validationErrors={validationErrors}
                    onAdd={(type: ConstraintType) => addConstraint(tabId, type)}
                    onUpdate={(id, updates) => updateConstraint(tabId, id, updates)}
                    onRemove={(id) => removeConstraint(tabId, id)}
                    onSelect={(id) => selectConstraint(tabId, id)}
                    selectedId={state?.selectedConstraintId ?? null}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Indexes Section */}
          <Collapsible
            open={expandedSections.indexes}
            onOpenChange={(open) => setExpandedSections((s) => ({ ...s, indexes: open }))}
          >
            <div className="rounded-lg border border-border/40">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  {expandedSections.indexes ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="font-medium">Indexes</span>
                  <span className="text-xs text-muted-foreground">
                    ({definition.indexes.length})
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border/40 p-3">
                  <IndexEditor
                    indexes={definition.indexes}
                    columns={definition.columns}
                    validationErrors={validationErrors}
                    onAdd={() => addIndex(tabId)}
                    onUpdate={(id, updates) => updateIndex(tabId, id, updates)}
                    onRemove={(id) => removeIndex(tabId, id)}
                    onSelect={(id) => selectIndex(tabId, id)}
                    selectedId={state?.selectedIndexId ?? null}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Validation errors summary */}
          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-border/40 p-4 space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <AlertCircle className="size-4 text-yellow-500" />
                Validation Issues
              </h3>
              <ul className="text-sm space-y-1">
                {validationErrors.map((err, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-center gap-2',
                      err.severity === 'error' ? 'text-destructive' : 'text-yellow-600'
                    )}
                  >
                    {err.severity === 'error' ? (
                      <X className="size-3" />
                    ) : (
                      <AlertCircle className="size-3" />
                    )}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* SQL Preview Dialog */}
      <Dialog open={sqlPreviewOpen} onOpenChange={setSqlPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>SQL Preview</DialogTitle>
            <DialogDescription>This SQL will be executed to create the table.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-4 font-mono text-sm overflow-auto max-h-96">
            <pre className="whitespace-pre-wrap">{previewSql}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSqlPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={handleSave} disabled={state?.isSaving}>
              {state?.isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Column row component
interface ColumnRowProps {
  column: ColumnDefinition
  isSelected: boolean
  validationErrors: ValidationError[]
  onSelect: () => void
  onChange: (field: keyof ColumnDefinition, value: unknown) => void
  onRemove: () => void
  onDuplicate: () => void
}

function ColumnRow({
  column,
  isSelected,
  validationErrors,
  onSelect,
  onChange,
  onRemove,
  onDuplicate
}: ColumnRowProps) {
  const hasErrors = validationErrors.length > 0
  const needsLength = column.dataType === 'varchar' || column.dataType === 'char'
  const needsPrecision = column.dataType === 'numeric'

  return (
    <div
      className={cn(
        'grid grid-cols-[32px_1fr_160px_80px_80px_80px_1fr_40px] gap-2 px-3 py-2 items-center group',
        isSelected && 'bg-muted/50',
        hasErrors && 'bg-destructive/5'
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div className="flex items-center justify-center">
        <GripVertical className="size-4 text-muted-foreground/50 cursor-grab" />
      </div>

      {/* Name */}
      <Input
        value={column.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="column_name"
        className={cn(
          'h-8 font-mono text-sm',
          validationErrors.some((e) => e.field.includes('.name')) && 'border-destructive'
        )}
      />

      {/* Type */}
      <div className="flex gap-1">
        <Select
          value={column.dataType}
          onValueChange={(v) => onChange('dataType', v as PostgresDataType)}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {Object.entries(DATA_TYPE_GROUPS).map(([group, types]) => (
              <div key={group}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  {group}
                </div>
                {types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
        {needsLength && (
          <Input
            type="number"
            value={column.length ?? ''}
            onChange={(e) =>
              onChange('length', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="n"
            className="h-8 w-14 text-center"
          />
        )}
        {needsPrecision && (
          <>
            <Input
              type="number"
              value={column.precision ?? ''}
              onChange={(e) =>
                onChange('precision', e.target.value ? parseInt(e.target.value) : undefined)
              }
              placeholder="p"
              className="h-8 w-12 text-center"
            />
            <Input
              type="number"
              value={column.scale ?? ''}
              onChange={(e) =>
                onChange('scale', e.target.value ? parseInt(e.target.value) : undefined)
              }
              placeholder="s"
              className="h-8 w-12 text-center"
            />
          </>
        )}
      </div>

      {/* Primary Key */}
      <div className="flex justify-center">
        <Checkbox
          checked={column.isPrimaryKey}
          onCheckedChange={(checked) => {
            onChange('isPrimaryKey', checked)
            if (checked) {
              onChange('isNullable', false)
            }
          }}
        />
      </div>

      {/* Not Null */}
      <div className="flex justify-center">
        <Checkbox
          checked={!column.isNullable}
          onCheckedChange={(checked) => onChange('isNullable', !checked)}
          disabled={column.isPrimaryKey}
        />
      </div>

      {/* Unique */}
      <div className="flex justify-center">
        <Checkbox
          checked={column.isUnique}
          onCheckedChange={(checked) => onChange('isUnique', checked)}
        />
      </div>

      {/* Default */}
      <Input
        value={column.defaultValue ?? ''}
        onChange={(e) => onChange('defaultValue', e.target.value || undefined)}
        placeholder="DEFAULT"
        className="h-8 font-mono text-sm"
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title="Duplicate column"
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove column"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
