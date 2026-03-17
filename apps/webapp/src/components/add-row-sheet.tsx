import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sparkles,
  Clock,
  Key,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Braces,
  Link2,
  List,
  Copy,
  Plus,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  Check,
  ChevronsUpDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnInfo } from '@data-peek/shared'

// Field type detection
type FieldType =
  | 'uuid'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'json'
  | 'enum'
  | 'foreignKey'

function getFieldType(column: ColumnInfo): FieldType {
  const dt = column.dataType.toLowerCase()

  // Check FK first - FK fields should use the FK selector, not generate random values
  if (column.foreignKey) return 'foreignKey'

  if (dt.includes('uuid')) return 'uuid'
  if (dt === 'boolean' || dt === 'bool') return 'boolean'
  if (dt.includes('json')) return 'json'
  if (dt === 'date') return 'date'
  if (dt === 'time' || dt === 'timetz') return 'time'
  if (dt.includes('timestamp') || dt.includes('datetime')) return 'datetime'
  if (
    dt.includes('int') ||
    dt.includes('numeric') ||
    dt.includes('decimal') ||
    dt.includes('float') ||
    dt.includes('double') ||
    dt.includes('real') ||
    dt.includes('serial') ||
    dt.includes('bigserial')
  ) {
    return 'number'
  }

  return 'text'
}

// Field type icons
const fieldTypeIcons: Record<FieldType, React.ElementType> = {
  uuid: Key,
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  time: Clock,
  datetime: Calendar,
  json: Braces,
  enum: List,
  foreignKey: Link2
}

// Field type colors
const fieldTypeColors: Record<FieldType, string> = {
  uuid: 'text-purple-400',
  text: 'text-green-400',
  number: 'text-blue-400',
  boolean: 'text-yellow-400',
  date: 'text-orange-400',
  time: 'text-orange-400',
  datetime: 'text-orange-400',
  json: 'text-pink-400',
  enum: 'text-cyan-400',
  foreignKey: 'text-blue-400'
}

/** FK reference value with display label */
export interface ForeignKeyValue {
  value: string | number
  label?: string // Optional display column value
}

interface SmartFieldProps {
  column: ColumnInfo
  value: unknown
  onChange: (value: unknown) => void
  enumValues?: string[]
  /** Available FK values for foreign key columns */
  foreignKeyValues?: ForeignKeyValue[]
  /** Whether FK values are being loaded */
  loadingFkValues?: boolean
}

function SmartField({
  column,
  value,
  onChange,
  enumValues,
  foreignKeyValues,
  loadingFkValues
}: SmartFieldProps) {
  const fieldType = getFieldType(column)
  const Icon = fieldTypeIcons[fieldType]
  const [fkSearchQuery, setFkSearchQuery] = React.useState('')
  const [fkPopoverOpen, setFkPopoverOpen] = React.useState(false)
  const iconColor = fieldTypeColors[fieldType]
  const isRequired = !column.isNullable && !column.defaultValue
  const hasDefault = !!column.defaultValue

  // Generate UUID - memoized to prevent recreation on every render
  const generateUUID = React.useCallback(() => {
    onChange(crypto.randomUUID())
  }, [onChange])

  // Set current timestamp - memoized
  const setNow = React.useCallback(() => {
    const now = new Date()
    if (fieldType === 'date') {
      onChange(now.toISOString().split('T')[0])
    } else if (fieldType === 'time') {
      onChange(now.toTimeString().split(' ')[0])
    } else {
      onChange(now.toISOString())
    }
  }, [onChange, fieldType])

  // Clear value - memoized
  const clearValue = React.useCallback(() => {
    onChange(null)
  }, [onChange])

  // Memoize filtered FK values to prevent recalculation on every render
  const filteredFkValues = React.useMemo(() => {
    if (!foreignKeyValues) return []
    if (!fkSearchQuery) return foreignKeyValues.slice(0, 100)
    const searchLower = fkSearchQuery.toLowerCase()
    return foreignKeyValues
      .filter(
        (fk) =>
          String(fk.value).toLowerCase().includes(searchLower) ||
          (fk.label && fk.label.toLowerCase().includes(searchLower))
      )
      .slice(0, 100)
  }, [foreignKeyValues, fkSearchQuery])

  const displayValue = value === null || value === undefined ? '' : String(value)

  return (
    <div className="group space-y-2">
      {/* Label Row */}
      <div className="flex items-center gap-2">
        <Icon className={cn('size-3.5', iconColor)} />
        <Label className="text-sm font-medium">{column.name}</Label>
        {isRequired && <span className="text-red-400 text-xs">*</span>}
        {column.isPrimaryKey && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 text-amber-500 border-amber-500/30"
          >
            PK
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn('text-[9px] px-1.5 py-0 font-mono ml-auto', iconColor)}
        >
          {column.dataType}
        </Badge>
      </div>

      {/* Input Row */}
      <div className="flex gap-2">
        {/* UUID Field */}
        {fieldType === 'uuid' && (
          <>
            <Input
              value={displayValue}
              onChange={(e) => onChange(e.target.value || null)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-xs h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-purple-500/50"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-300"
                    onClick={generateUUID}
                  >
                    <Sparkles className="size-3.5" />
                    Generate
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generate random UUID</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        {/* Boolean Field */}
        {fieldType === 'boolean' && (
          <div className="flex items-center gap-3 h-9 px-3 rounded-md bg-muted/30 border border-border/50 flex-1">
            <Switch
              checked={value === true}
              onCheckedChange={(checked) => onChange(checked)}
              className="data-[state=checked]:bg-yellow-500"
            />
            <span className="text-sm text-muted-foreground">
              {value === null ? 'NULL' : value ? 'true' : 'false'}
            </span>
            {column.isNullable && value !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 ml-auto text-xs text-muted-foreground hover:text-foreground"
                onClick={clearValue}
              >
                Set NULL
              </Button>
            )}
          </div>
        )}

        {/* Date/Time/DateTime Fields */}
        {(fieldType === 'date' || fieldType === 'time' || fieldType === 'datetime') && (
          <>
            <Input
              type={fieldType === 'datetime' ? 'datetime-local' : fieldType}
              value={
                fieldType === 'datetime' && displayValue
                  ? displayValue.replace('Z', '').slice(0, 16)
                  : displayValue
              }
              onChange={(e) => {
                if (!e.target.value) {
                  onChange(null)
                } else if (fieldType === 'datetime') {
                  onChange(new Date(e.target.value).toISOString())
                } else {
                  onChange(e.target.value)
                }
              }}
              className="h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-orange-500/50"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-orange-400 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-300"
                    onClick={setNow}
                  >
                    <Clock className="size-3.5" />
                    Now
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Set to current {fieldType}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        {/* Number Field */}
        {fieldType === 'number' && (
          <Input
            type="number"
            value={displayValue}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange(null)
              } else {
                const num = parseFloat(e.target.value)
                onChange(isNaN(num) ? null : num)
              }
            }}
            placeholder={hasDefault ? `Default: ${column.defaultValue}` : '0'}
            className="h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-blue-500/50 font-mono"
          />
        )}

        {/* JSON Field */}
        {fieldType === 'json' && (
          <Textarea
            value={
              typeof value === 'object' && value !== null
                ? JSON.stringify(value, null, 2)
                : displayValue
            }
            onChange={(e) => {
              if (!e.target.value) {
                onChange(null)
              } else {
                try {
                  onChange(JSON.parse(e.target.value))
                } catch {
                  onChange(e.target.value)
                }
              }
            }}
            placeholder='{"key": "value"}'
            className="min-h-[80px] flex-1 bg-muted/30 border-border/50 focus-visible:ring-pink-500/50 font-mono text-xs resize-y"
          />
        )}

        {/* Enum Field */}
        {fieldType === 'enum' && enumValues && enumValues.length > 0 ? (
          <Select value={displayValue || ''} onValueChange={(v) => onChange(v || null)}>
            <SelectTrigger className="h-9 flex-1 bg-muted/30 border-border/50 focus:ring-cyan-500/50">
              <SelectValue placeholder="Select value..." />
            </SelectTrigger>
            <SelectContent>
              {column.isNullable && <SelectItem value="">NULL</SelectItem>}
              {enumValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : fieldType === 'enum' ? (
          <Input
            value={displayValue}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="Enter enum value..."
            className="h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-cyan-500/50"
          />
        ) : null}

        {/* Text Field (default) */}
        {fieldType === 'text' && (
          <Input
            value={displayValue}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={hasDefault ? `Default: ${column.defaultValue}` : 'Enter value...'}
            className="h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-green-500/50"
          />
        )}

        {/* Foreign Key Field - searchable combobox */}
        {fieldType === 'foreignKey' && (
          <div className="flex gap-2 flex-1">
            {loadingFkValues ? (
              <div className="h-9 flex-1 bg-muted/30 border border-border/50 rounded-md flex items-center px-3 gap-2">
                <div className="size-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">Loading values...</span>
              </div>
            ) : foreignKeyValues && foreignKeyValues.length > 0 ? (
              <Popover open={fkPopoverOpen} onOpenChange={setFkPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={fkPopoverOpen}
                    className="h-9 flex-1 justify-between bg-muted/30 border-border/50 hover:bg-muted/50 font-normal"
                  >
                    <span
                      className={cn(
                        'truncate font-mono text-xs',
                        !displayValue && 'text-muted-foreground'
                      )}
                    >
                      {displayValue || `Select from ${column.foreignKey?.referencedTable}...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  {/* Search input */}
                  <div className="flex items-center border-b px-3 py-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      placeholder="Search..."
                      value={fkSearchQuery}
                      onChange={(e) => setFkSearchQuery(e.target.value)}
                      className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {fkSearchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setFkSearchQuery('')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {/* Options list */}
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {column.isNullable && (
                      <button
                        type="button"
                        className={cn(
                          'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                          value === null && 'bg-accent'
                        )}
                        onClick={() => {
                          onChange(null)
                          setFkPopoverOpen(false)
                          setFkSearchQuery('')
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === null ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="text-muted-foreground italic">NULL</span>
                      </button>
                    )}
                    {filteredFkValues.map((fk) => {
                      const isSelected = String(value) === String(fk.value)
                      return (
                        <button
                          key={String(fk.value)}
                          type="button"
                          className={cn(
                            'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                            isSelected && 'bg-accent'
                          )}
                          onClick={() => {
                            onChange(fk.value)
                            setFkPopoverOpen(false)
                            setFkSearchQuery('')
                          }}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                          />
                          <span className="font-mono text-xs">{fk.value}</span>
                          {fk.label && (
                            <span className="ml-2 text-muted-foreground text-xs">({fk.label})</span>
                          )}
                        </button>
                      )
                    })}
                    {filteredFkValues.length === 0 && fkSearchQuery && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No results found.
                      </div>
                    )}
                    {foreignKeyValues.length > 100 && !fkSearchQuery && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground text-center border-t mt-1">
                        Showing first 100 of {foreignKeyValues.length}. Type to search...
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              // Fallback to manual input if no FK values available
              <Input
                value={displayValue}
                onChange={(e) => onChange(e.target.value || null)}
                placeholder={`Enter ${column.foreignKey?.referencedColumn} value...`}
                className="h-9 flex-1 bg-muted/30 border-border/50 focus-visible:ring-blue-500/50 font-mono text-xs"
              />
            )}
            {column.foreignKey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="h-9 px-2 text-[10px] text-blue-400 border-blue-500/30 flex items-center gap-1 shrink-0"
                    >
                      <Link2 className="size-3" />
                      {column.foreignKey.referencedTable}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    References {column.foreignKey.referencedSchema}.
                    {column.foreignKey.referencedTable}.{column.foreignKey.referencedColumn}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Clear button for nullable non-boolean fields */}
        {column.isNullable && fieldType !== 'boolean' && value !== null && value !== undefined && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={clearValue}
                >
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Set to NULL</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Helper text */}
      {hasDefault && (
        <p className="text-[10px] text-muted-foreground pl-5">
          Default: <code className="bg-muted/50 px-1 rounded">{column.defaultValue}</code>
        </p>
      )}
    </div>
  )
}

export interface AddRowSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ColumnInfo[]
  tableName: string
  schemaName?: string
  /** Pre-fill values (for duplicate row) */
  initialValues?: Record<string, unknown>
  /** Enum values per column */
  enumValuesMap?: Record<string, string[]>
  /** FK values per column name */
  foreignKeyValuesMap?: Record<string, ForeignKeyValue[]>
  /** Whether FK values are being loaded */
  loadingFkValues?: boolean
  onSubmit: (values: Record<string, unknown>) => void
  /** Whether this is duplicating an existing row */
  isDuplicate?: boolean
}

export function AddRowSheet({
  open,
  onOpenChange,
  columns,
  tableName,
  schemaName,
  initialValues,
  enumValuesMap = {},
  foreignKeyValuesMap = {},
  loadingFkValues = false,
  onSubmit,
  isDuplicate = false
}: AddRowSheetProps) {
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const [showOptional, setShowOptional] = React.useState(true)

  // Initialize values when sheet opens
  React.useEffect(() => {
    if (open) {
      if (initialValues) {
        // Duplicate mode - copy values, but clear auto-generated PKs
        const copied = { ...initialValues }
        columns.forEach((col) => {
          // Clear auto-increment / serial PKs
          if (
            col.isPrimaryKey &&
            (col.defaultValue?.includes('nextval') || col.dataType.toLowerCase().includes('serial'))
          ) {
            copied[col.name] = null
          }
        })
        setValues(copied)
      } else {
        // Fresh row - set defaults
        const defaults: Record<string, unknown> = {}
        columns.forEach((col) => {
          defaults[col.name] = null
        })
        setValues(defaults)
      }
    }
  }, [open, initialValues, columns])

  const handleValueChange = (columnName: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [columnName]: value }))
  }

  const handleSubmit = () => {
    onSubmit(values)
    onOpenChange(false)
  }

  // Separate required and optional fields
  const requiredColumns = columns.filter((col) => !col.isNullable && !col.defaultValue)
  const optionalColumns = columns.filter((col) => col.isNullable || col.defaultValue)

  // Count filled values
  const filledCount = Object.values(values).filter((v) => v !== null && v !== undefined).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0 border-l border-border/50 bg-background/95 backdrop-blur-xl"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'size-10 rounded-lg flex items-center justify-center',
                isDuplicate ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'
              )}
            >
              {isDuplicate ? <Copy className="size-5" /> : <Plus className="size-5" />}
            </div>
            <div>
              <SheetTitle className="text-base">
                {isDuplicate ? 'Duplicate Row' : 'Add New Row'}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {schemaName && <span className="text-muted-foreground">{schemaName}.</span>}
                <span className="text-foreground font-medium">{tableName}</span>
                <span className="text-muted-foreground ml-2">
                  {filledCount} / {columns.length} fields
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Form */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-6">
            {/* Required Fields */}
            {requiredColumns.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-3.5 text-red-400" />
                  <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
                    Required Fields
                  </span>
                  <div className="h-px flex-1 bg-red-500/20" />
                </div>
                {requiredColumns.map((col) => (
                  <SmartField
                    key={col.name}
                    column={col}
                    value={values[col.name]}
                    onChange={(v) => handleValueChange(col.name, v)}
                    enumValues={enumValuesMap[col.name]}
                    foreignKeyValues={foreignKeyValuesMap[col.name]}
                    loadingFkValues={loadingFkValues && !!col.foreignKey}
                  />
                ))}
              </div>
            )}

            {/* Optional Fields */}
            {optionalColumns.length > 0 && (
              <div className="space-y-4">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full group"
                  onClick={() => setShowOptional(!showOptional)}
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Optional Fields
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({optionalColumns.length})
                  </span>
                  <div className="h-px flex-1 bg-border/50" />
                  {showOptional ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </button>
                {showOptional && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {optionalColumns.map((col) => (
                      <SmartField
                        key={col.name}
                        column={col}
                        value={values[col.name]}
                        onChange={(v) => handleValueChange(col.name, v)}
                        enumValues={enumValuesMap[col.name]}
                        foreignKeyValues={foreignKeyValuesMap[col.name]}
                        loadingFkValues={loadingFkValues && !!col.foreignKey}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <SheetFooter className="px-6 py-4 border-t border-border/30 shrink-0">
          <div className="flex items-center gap-3 w-full">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-10">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className={cn(
                'flex-1 h-10 gap-2',
                isDuplicate ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {isDuplicate ? (
                <>
                  <Copy className="size-4" />
                  Duplicate Row
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Add Row
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
