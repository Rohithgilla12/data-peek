import * as React from 'react'
import { Check, X, RotateCcw, Braces } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { JsonCellEditor } from '@/components/json-cell-value'

interface EditableCellProps {
  value: unknown
  originalValue: unknown
  dataType: string
  isEditing: boolean
  isModified: boolean
  isNewRow?: boolean
  isDeleted?: boolean
  enumValues?: string[]
  columnName?: string
  onStartEdit: () => void
  onSave: (value: unknown) => void
  onCancel: () => void
  onRevert?: () => void
}

/**
 * Get appropriate input type based on column data type
 */
function getInputType(dataType: string): string {
  const lower = dataType.toLowerCase()
  if (lower.includes('int') || lower.includes('numeric') || lower.includes('decimal')) {
    return 'number'
  }
  if (lower.includes('date') && !lower.includes('time')) {
    return 'date'
  }
  if (lower === 'time' || lower === 'timetz') {
    return 'time'
  }
  return 'text'
}

/**
 * Parse input value to appropriate type
 */
function parseValue(value: string, dataType: string): unknown {
  if (value === '' || value === 'NULL') return null

  const lower = dataType.toLowerCase()

  // Numbers
  if (lower.includes('int')) {
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? value : parsed
  }
  if (
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('real')
  ) {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? value : parsed
  }

  // Booleans
  if (lower === 'boolean' || lower === 'bool') {
    const lowVal = value.toLowerCase()
    if (lowVal === 'true' || lowVal === 't' || lowVal === '1') return true
    if (lowVal === 'false' || lowVal === 'f' || lowVal === '0') return false
    return value
  }

  // JSON
  if (lower.includes('json')) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return value
}

/**
 * Format value for display in input
 */
function formatForInput(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return ''

  const lower = dataType.toLowerCase()

  if (lower.includes('json') && typeof value === 'object') {
    return JSON.stringify(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

export function EditableCell({
  value,
  originalValue,
  dataType,
  isEditing,
  isModified,
  isNewRow = false,
  isDeleted = false,
  enumValues,
  columnName,
  onStartEdit,
  onSave,
  onCancel,
  onRevert
}: EditableCellProps) {
  const [editValue, setEditValue] = React.useState('')
  const [isJsonEditorOpen, setIsJsonEditorOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const isJson = dataType.toLowerCase().includes('json')

  // Initialize edit value when entering edit mode
  React.useEffect(() => {
    if (isEditing) {
      // For JSON fields, open the JSON editor instead
      if (isJson) {
        setIsJsonEditorOpen(true)
        return
      }
      setEditValue(formatForInput(value, dataType))
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isEditing, value, dataType, isJson])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSave(parseValue(editValue, dataType))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Tab') {
      // Tab should save and move to next cell (handled by parent)
      onSave(parseValue(editValue, dataType))
    }
  }

  const handleBlur = () => {
    // Save on blur (clicking outside)
    onSave(parseValue(editValue, dataType))
  }

  // Editing state
  if (isEditing) {
    const inputType = getInputType(dataType)
    const isBoolean = dataType.toLowerCase() === 'boolean' || dataType.toLowerCase() === 'bool'
    const isEnum = enumValues && enumValues.length > 0

    // JSON editing uses a sheet editor
    if (isJson && isJsonEditorOpen) {
      return (
        <>
          <div className="flex items-center gap-1.5 text-amber-500">
            <Braces className="size-3.5" />
            <span className="text-xs">Editing...</span>
          </div>
          <JsonCellEditor
            value={value}
            columnName={columnName}
            onSave={(newValue) => {
              setIsJsonEditorOpen(false)
              onSave(newValue)
            }}
            onCancel={() => {
              setIsJsonEditorOpen(false)
              onCancel()
            }}
          />
        </>
      )
    }

    return (
      <div className="flex items-center gap-1 -mx-1">
        {isBoolean ? (
          <select
            ref={inputRef as unknown as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-7 text-xs px-2 bg-background border border-primary/50 rounded focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">NULL</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isEnum ? (
          <select
            ref={inputRef as unknown as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-7 text-xs px-2 bg-background border border-primary/50 rounded focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px]"
          >
            <option value="">NULL</option>
            {enumValues.map((enumVal) => (
              <option key={enumVal} value={enumVal}>
                {enumVal}
              </option>
            ))}
          </select>
        ) : (
          <Input
            ref={inputRef}
            type={inputType}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="NULL"
            className="h-7 text-xs px-2 min-w-[100px] max-w-[300px] bg-background border-primary/50 focus-visible:ring-1 focus-visible:ring-primary"
          />
        )}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-green-500 hover:text-green-400 hover:bg-green-500/10"
            onClick={() => onSave(parseValue(editValue, dataType))}
          >
            <Check className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-red-500 hover:text-red-400 hover:bg-red-500/10"
            onClick={onCancel}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
    )
  }

  // Display state
  const displayValue =
    value === null || value === undefined
      ? 'NULL'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

  const isNull = value === null || value === undefined

  return (
    <TooltipProvider>
      <div
        className={cn(
          'group relative flex items-center gap-1 min-h-[28px]',
          isDeleted && 'opacity-50'
        )}
      >
        {/* Modified indicator - amber left border */}
        {isModified && !isNewRow && !isDeleted && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500 rounded-full" />
        )}
        {/* New row indicator - green left border */}
        {isNewRow && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-green-500 rounded-full" />
        )}
        {/* Deleted indicator - red left border */}
        {isDeleted && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 rounded-full" />
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onStartEdit}
              disabled={isDeleted}
              className={cn(
                'text-left truncate max-w-[300px] px-1.5 py-0.5 rounded transition-colors cursor-text',
                !isDeleted && 'hover:bg-accent/50',
                isNull && 'text-muted-foreground/50 italic',
                isModified && !isNewRow && 'bg-amber-500/10',
                isNewRow && 'bg-green-500/10',
                isDeleted && 'line-through text-muted-foreground cursor-not-allowed'
              )}
            >
              {displayValue}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-md">
            <div className="space-y-1">
              <p className="text-xs font-mono break-all">{displayValue}</p>
              {isModified && !isNewRow && (
                <p className="text-[10px] text-muted-foreground">
                  Original: {formatForInput(originalValue, dataType) || 'NULL'}
                </p>
              )}
              {!isDeleted && <p className="text-[10px] text-muted-foreground">Click to edit</p>}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Revert button for modified cells */}
        {isModified && onRevert && !isDeleted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                onClick={onRevert}
              >
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Revert to original</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
