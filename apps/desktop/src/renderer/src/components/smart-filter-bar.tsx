import * as React from 'react'
import { X, Search, DatabaseZap } from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import { getTypeColor } from '@/lib/type-colors'
import { useClickCopy } from '@/hooks'

export interface FilterColumn {
  name: string
  dataType: string
}

export interface FilterChip {
  id: string
  column: string | null
  operator: string
  value: string
}

type FilterOperator = {
  label: string
  value: string
  description: string
}

const STRING_OPERATORS: FilterOperator[] = [
  { label: 'contains', value: 'contains', description: 'Contains text' },
  { label: 'equals', value: 'equals', description: 'Exact match' },
  { label: 'starts with', value: 'starts_with', description: 'Starts with text' },
  { label: 'ends with', value: 'ends_with', description: 'Ends with text' },
  { label: 'is empty', value: 'is_empty', description: 'Is null or empty' },
  { label: 'is not empty', value: 'is_not_empty', description: 'Is not null or empty' }
]

const NUMERIC_OPERATORS: FilterOperator[] = [
  { label: '=', value: 'eq', description: 'Equal to' },
  { label: '!=', value: 'neq', description: 'Not equal to' },
  { label: '>', value: 'gt', description: 'Greater than' },
  { label: '>=', value: 'gte', description: 'Greater than or equal' },
  { label: '<', value: 'lt', description: 'Less than' },
  { label: '<=', value: 'lte', description: 'Less than or equal' },
  { label: 'between', value: 'between', description: 'Between two values' },
  { label: 'is empty', value: 'is_empty', description: 'Is null' }
]

const DATE_OPERATORS: FilterOperator[] = [
  { label: 'equals', value: 'eq', description: 'Exact date' },
  { label: 'before', value: 'lt', description: 'Before date' },
  { label: 'after', value: 'gt', description: 'After date' },
  { label: 'between', value: 'between', description: 'Date range' },
  { label: 'is empty', value: 'is_empty', description: 'Is null' }
]

const BOOL_OPERATORS: FilterOperator[] = [
  { label: 'is true', value: 'is_true', description: 'Boolean true' },
  { label: 'is false', value: 'is_false', description: 'Boolean false' },
  { label: 'is empty', value: 'is_empty', description: 'Is null' }
]

type TypeCategory = 'bool' | 'numeric' | 'date' | 'string'

function getTypeCategory(dataType: string): TypeCategory {
  const lower = dataType.toLowerCase()
  if (lower.includes('bool')) return 'bool'
  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('real') ||
    lower.includes('money') ||
    lower.includes('serial') ||
    lower.includes('bigint')
  )
    return 'numeric'
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time')) return 'date'
  return 'string'
}

function getOperatorsForType(dataType: string): FilterOperator[] {
  const category = getTypeCategory(dataType)
  if (category === 'bool') return BOOL_OPERATORS
  if (category === 'numeric') return NUMERIC_OPERATORS
  if (category === 'date') return DATE_OPERATORS
  return STRING_OPERATORS
}

function getDefaultOperator(dataType: string): string {
  const category = getTypeCategory(dataType)
  if (category === 'bool') return 'is_true'
  if (category === 'numeric' || category === 'date') return 'eq'
  return 'contains'
}

function isNoValueOperator(op: string): boolean {
  return op === 'is_empty' || op === 'is_not_empty' || op === 'is_true' || op === 'is_false'
}

function chipToText(chip: FilterChip): string {
  if (!chip.column) return chip.value
  const opLabel = chip.operator
  if (isNoValueOperator(chip.operator)) return `${chip.column} ${opLabel}`
  return `${chip.column} ${opLabel} ${chip.value}`
}

function chipMatchesRow(chip: FilterChip, row: Record<string, unknown>): boolean {
  if (!chip.column) {
    const searchTerm = chip.value.toLowerCase()
    return Object.values(row).some((v) => {
      if (v === null || v === undefined) return false
      return String(v).toLowerCase().includes(searchTerm)
    })
  }

  const cellValue = row[chip.column]
  const op = chip.operator

  if (op === 'is_empty') return cellValue === null || cellValue === undefined || cellValue === ''
  if (op === 'is_not_empty')
    return cellValue !== null && cellValue !== undefined && cellValue !== ''
  if (op === 'is_true') return cellValue === true || cellValue === 't' || cellValue === 'true'
  if (op === 'is_false') return cellValue === false || cellValue === 'f' || cellValue === 'false'

  if (cellValue === null || cellValue === undefined) return false
  const strValue = String(cellValue).toLowerCase()
  const filterValue = chip.value.toLowerCase()

  switch (op) {
    case 'contains':
      return strValue.includes(filterValue)
    case 'equals':
    case 'eq':
      return strValue === filterValue
    case 'neq':
      return strValue !== filterValue
    case 'starts_with':
      return strValue.startsWith(filterValue)
    case 'ends_with':
      return strValue.endsWith(filterValue)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(cellValue)
      const b = Number(chip.value)
      const [cmp, ref] =
        Number.isNaN(a) || Number.isNaN(b)
          ? [new Date(String(cellValue)).getTime(), new Date(chip.value).getTime()]
          : [a, b]
      if (Number.isNaN(cmp) || Number.isNaN(ref)) return false
      if (op === 'gt') return cmp > ref
      if (op === 'gte') return cmp >= ref
      if (op === 'lt') return cmp < ref
      return cmp <= ref
    }
    case 'between': {
      const parts = chip.value.split(',').map((s) => s.trim())
      if (parts.length !== 2) return false
      const num = Number(cellValue)
      if (!Number.isNaN(num)) return num >= Number(parts[0]) && num <= Number(parts[1])
      const ts = new Date(String(cellValue)).getTime()
      const lo = new Date(parts[0]).getTime()
      const hi = new Date(parts[1]).getTime()
      if (Number.isNaN(ts) || Number.isNaN(lo) || Number.isNaN(hi)) return false
      return ts >= lo && ts <= hi
    }
    default:
      return strValue.includes(filterValue)
  }
}

function nextChipId(): string {
  return crypto.randomUUID()
}

type BuilderStep = 'column' | 'operator' | 'value'

function FilterChipButton({
  chip,
  isEditing,
  onCopy,
  onEdit,
  onRemove,
  chipDisplayLabel
}: {
  chip: FilterChip
  isEditing: boolean
  onCopy: (chip: FilterChip) => void
  onEdit: (chip: FilterChip) => void
  onRemove: (chipId: string) => void
  chipDisplayLabel: (chip: FilterChip) => React.ReactNode
}) {
  const [isNew, setIsNew] = React.useState(true)
  const onDoubleClick = React.useCallback(() => onEdit(chip), [chip, onEdit])
  const { copied, handleClick, handleDoubleClick } = useClickCopy({ onDoubleClick })

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setIsNew(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  const onClick = React.useCallback(() => {
    handleClick(chipToText(chip))
  }, [chip, handleClick])

  return (
    <button
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'group/chip relative flex items-center gap-1 px-2 py-0.5 rounded-md text-xs',
        'border cursor-default select-none',
        'transition-[border-color,background-color,box-shadow] duration-150',
        'hover:border-primary/40 hover:bg-primary/5',
        'motion-safe:transition-all',
        isNew && 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
        isNew && 'motion-safe:duration-200',
        isEditing
          ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/20'
          : copied
            ? 'border-green-500/50 bg-green-500/10'
            : 'border-border/60 bg-muted/50'
      )}
    >
      <span className={cn('transition-opacity duration-150', copied ? 'opacity-0' : 'opacity-100')}>
        {chipDisplayLabel(chip)}
      </span>
      {copied && (
        <span className="absolute inset-0 flex items-center justify-center gap-1 text-green-400 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
          <svg
            className="size-3"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M3 8.5 L6.5 12 L13 4"
              className="motion-safe:[stroke-dasharray:20] motion-safe:[stroke-dashoffset:20] motion-safe:animate-[check-draw_300ms_ease-out_forwards]"
            />
          </svg>
          <span className="text-[10px] font-medium">Copied</span>
        </span>
      )}
      <span
        role="button"
        tabIndex={-1}
        className={cn(
          'ml-0.5 transition-opacity duration-100',
          copied ? 'opacity-0' : 'opacity-0 group-hover/chip:opacity-100'
        )}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(chip.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation()
            onRemove(chip.id)
          }
        }}
      >
        <X className="size-3 text-muted-foreground hover:text-foreground" />
      </span>
    </button>
  )
}

interface SmartFilterBarProps {
  columns: FilterColumn[]
  onFilterChange: (chips: FilterChip[]) => void
  onApplyToQuery?: () => void
  totalRows: number
  filteredRows: number
  className?: string
}

export function SmartFilterBar({
  columns,
  onFilterChange,
  onApplyToQuery,
  totalRows,
  filteredRows,
  className
}: SmartFilterBarProps) {
  const [chips, setChips] = React.useState<FilterChip[]>([])
  const [isBuilding, setIsBuilding] = React.useState(false)
  const [builderStep, setBuilderStep] = React.useState<BuilderStep>('column')
  const [inputValue, setInputValue] = React.useState('')
  const [selectedColumn, setSelectedColumn] = React.useState<FilterColumn | null>(null)
  const [selectedOperator, setSelectedOperator] = React.useState<string>('')
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const [editingChipId, setEditingChipId] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  const notifyChange = React.useCallback(
    (newChips: FilterChip[]) => {
      setChips(newChips)
      onFilterChange(newChips)
    },
    [onFilterChange]
  )

  const getFilteredColumns = React.useCallback(() => {
    if (!inputValue.trim()) return columns
    const search = inputValue.toLowerCase()
    return columns.filter(
      (c) => c.name.toLowerCase().includes(search) || c.dataType.toLowerCase().includes(search)
    )
  }, [columns, inputValue])

  const getFilteredOperators = React.useCallback(() => {
    if (!selectedColumn) return []
    const ops = getOperatorsForType(selectedColumn.dataType)
    if (!inputValue.trim()) return ops
    const search = inputValue.toLowerCase()
    return ops.filter(
      (o) => o.label.toLowerCase().includes(search) || o.description.toLowerCase().includes(search)
    )
  }, [selectedColumn, inputValue])

  const dropdownItems = React.useMemo(() => {
    if (builderStep === 'column') return getFilteredColumns()
    if (builderStep === 'operator') return getFilteredOperators()
    return []
  }, [builderStep, getFilteredColumns, getFilteredOperators])

  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [dropdownItems.length, builderStep, inputValue])

  const startBuilding = React.useCallback(() => {
    setIsBuilding(true)
    setBuilderStep('column')
    setInputValue('')
    setSelectedColumn(null)
    setSelectedOperator('')
    setEditingChipId(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const cancelBuilding = React.useCallback(() => {
    setIsBuilding(false)
    setBuilderStep('column')
    setInputValue('')
    setSelectedColumn(null)
    setSelectedOperator('')
    setEditingChipId(null)
  }, [])

  const selectColumn = React.useCallback(
    (col: FilterColumn) => {
      setSelectedColumn(col)
      setInputValue('')
      const defaultOp = getDefaultOperator(col.dataType)
      if (isNoValueOperator(defaultOp)) {
        const chip: FilterChip = {
          id: editingChipId || nextChipId(),
          column: col.name,
          operator: defaultOp,
          value: ''
        }
        if (editingChipId) {
          notifyChange(chips.map((c) => (c.id === editingChipId ? chip : c)))
        } else {
          notifyChange([...chips, chip])
        }
        cancelBuilding()
      } else {
        setBuilderStep('operator')
      }
    },
    [chips, editingChipId, cancelBuilding, notifyChange]
  )

  const selectOperator = React.useCallback(
    (op: FilterOperator) => {
      setSelectedOperator(op.value)
      setInputValue('')
      if (isNoValueOperator(op.value)) {
        const chip: FilterChip = {
          id: editingChipId || nextChipId(),
          column: selectedColumn!.name,
          operator: op.value,
          value: ''
        }
        if (editingChipId) {
          notifyChange(chips.map((c) => (c.id === editingChipId ? chip : c)))
        } else {
          notifyChange([...chips, chip])
        }
        cancelBuilding()
      } else {
        setBuilderStep('value')
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    },
    [selectedColumn, chips, editingChipId, cancelBuilding, notifyChange]
  )

  const commitValue = React.useCallback(() => {
    const value = inputValue.trim()
    if (!value) return

    if (!isBuilding || builderStep === 'column') {
      const chip: FilterChip = {
        id: nextChipId(),
        column: null,
        operator: 'contains',
        value
      }
      notifyChange([...chips, chip])
      setInputValue('')
      return
    }

    if (builderStep === 'value' && selectedColumn) {
      const chip: FilterChip = {
        id: editingChipId || nextChipId(),
        column: selectedColumn.name,
        operator: selectedOperator,
        value
      }
      if (editingChipId) {
        notifyChange(chips.map((c) => (c.id === editingChipId ? chip : c)))
      } else {
        notifyChange([...chips, chip])
      }
      cancelBuilding()
    }
  }, [
    inputValue,
    isBuilding,
    builderStep,
    selectedColumn,
    selectedOperator,
    chips,
    editingChipId,
    cancelBuilding,
    notifyChange
  ])

  const removeChip = React.useCallback(
    (chipId: string) => {
      notifyChange(chips.filter((c) => c.id !== chipId))
    },
    [chips, notifyChange]
  )

  const copyChip = React.useCallback((chip: FilterChip) => {
    navigator.clipboard.writeText(chipToText(chip))
  }, [])

  const editChip = React.useCallback(
    (chip: FilterChip) => {
      setEditingChipId(chip.id)
      if (chip.column) {
        const col = columns.find((c) => c.name === chip.column)
        if (col) {
          setSelectedColumn(col)
          setSelectedOperator(chip.operator)
          setInputValue(chip.value)
          setBuilderStep('value')
          setIsBuilding(true)
          setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
          }, 0)
        }
      } else {
        setSelectedColumn(null)
        setInputValue(chip.value)
        setBuilderStep('column')
        setIsBuilding(true)
        setTimeout(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        }, 0)
      }
    },
    [columns]
  )

  const clearAll = React.useCallback(() => {
    notifyChange([])
    cancelBuilding()
  }, [notifyChange, cancelBuilding])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelBuilding()
        inputRef.current?.blur()
        return
      }

      if (e.key === 'Backspace' && !inputValue && chips.length > 0 && !isBuilding) {
        e.preventDefault()
        const lastChip = chips[chips.length - 1]
        removeChip(lastChip.id)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if ((builderStep === 'column' || builderStep === 'operator') && dropdownItems.length > 0) {
          const item = dropdownItems[highlightedIndex]
          if (builderStep === 'column') {
            selectColumn(item as FilterColumn)
          } else {
            selectOperator(item as FilterOperator)
          }
        } else {
          commitValue()
        }
        return
      }

      if (e.key === 'Tab' && isBuilding) {
        e.preventDefault()
        if ((builderStep === 'column' || builderStep === 'operator') && dropdownItems.length > 0) {
          const item = dropdownItems[highlightedIndex]
          if (builderStep === 'column') {
            selectColumn(item as FilterColumn)
          } else {
            selectOperator(item as FilterOperator)
          }
        } else if (builderStep === 'value') {
          commitValue()
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((i) => Math.min(i + 1, dropdownItems.length - 1))
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((i) => Math.max(i - 1, 0))
        return
      }
    },
    [
      inputValue,
      chips,
      isBuilding,
      builderStep,
      dropdownItems,
      highlightedIndex,
      cancelBuilding,
      removeChip,
      selectColumn,
      selectOperator,
      commitValue
    ]
  )

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const target = e.target as HTMLElement
        const isInEditor =
          target.closest('.monaco-editor') || target.closest('[data-monaco-editor]')
        if (!isInEditor) {
          e.preventDefault()
          inputRef.current?.focus()
          if (!isBuilding) startBuilding()
        }
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isBuilding, startBuilding])

  React.useEffect(() => {
    if (!isBuilding) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        barRef.current &&
        !barRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        if (inputValue.trim()) {
          commitValue()
        } else {
          cancelBuilding()
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isBuilding, inputValue, commitValue, cancelBuilding])

  React.useEffect(() => {
    if (!isBuilding || !dropdownRef.current) return
    const highlighted = dropdownRef.current.querySelector('[data-highlighted="true"]')
    highlighted?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isBuilding])

  const showDropdown = isBuilding && (builderStep === 'column' || builderStep === 'operator')

  const chipDisplayLabel = React.useCallback(
    (chip: FilterChip): React.ReactNode => {
      if (!chip.column) {
        return (
          <span className="flex items-center gap-1">
            <Search className="size-3 text-muted-foreground" />
            <span className="text-foreground">{chip.value}</span>
          </span>
        )
      }

      const col = columns.find((c) => c.name === chip.column)
      const typeColor = col ? getTypeColor(col.dataType) : 'text-muted-foreground'
      const ops = col ? getOperatorsForType(col.dataType) : STRING_OPERATORS
      const opLabel = ops.find((o) => o.value === chip.operator)?.label ?? chip.operator

      if (isNoValueOperator(chip.operator)) {
        return (
          <span className="flex items-center gap-1">
            <span className={cn('font-medium', typeColor)}>{chip.column}</span>
            <span className="text-muted-foreground">{opLabel}</span>
          </span>
        )
      }

      return (
        <span className="flex items-center gap-1">
          <span className={cn('font-medium', typeColor)}>{chip.column}</span>
          <span className="text-muted-foreground">{opLabel}</span>
          <span className="text-foreground">{chip.value}</span>
        </span>
      )
    },
    [columns]
  )

  const placeholderText = React.useMemo(() => {
    if (isBuilding) {
      if (builderStep === 'column') return 'Type column name or search all...'
      if (builderStep === 'operator') return `Operator for ${selectedColumn?.name}...`
      if (builderStep === 'value') {
        if (selectedOperator === 'between') return 'min, max (e.g. 10, 100)'
        return `Value for ${selectedColumn?.name}...`
      }
    }
    if (chips.length > 0) return 'Add filter...'
    return 'Filter results... (\u2318F)'
  }, [isBuilding, builderStep, selectedColumn, selectedOperator, chips.length])

  const hasActiveFilters = chips.length > 0
  const isFiltered = filteredRows !== totalRows

  return (
    <div className={cn('relative', className)}>
      <div
        ref={barRef}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 border-b',
          'transition-[border-color,background-color] duration-200 ease-out',
          hasActiveFilters ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/30'
        )}
      >
        <Search
          className={cn(
            'size-3.5 shrink-0 transition-colors duration-200',
            hasActiveFilters ? 'text-primary/70' : 'text-muted-foreground/50'
          )}
        />

        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          {chips.map((chip) => (
            <FilterChipButton
              key={chip.id}
              chip={chip}
              isEditing={editingChipId === chip.id}
              onCopy={copyChip}
              onEdit={editChip}
              onRemove={removeChip}
              chipDisplayLabel={chipDisplayLabel}
            />
          ))}

          {isBuilding && (builderStep === 'operator' || builderStep === 'value') && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-150">
              {selectedColumn && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded bg-muted/80 font-medium',
                    getTypeColor(selectedColumn.dataType)
                  )}
                >
                  {selectedColumn.name}
                </span>
              )}
              {builderStep === 'value' && selectedOperator && (
                <span className="px-1 py-0.5 text-muted-foreground">
                  {getOperatorsForType(selectedColumn!.dataType).find(
                    (o) => o.value === selectedOperator
                  )?.label ?? selectedOperator}
                </span>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              if (!isBuilding) startBuilding()
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            className={cn(
              'flex-1 min-w-[120px] h-6 bg-transparent text-xs outline-none',
              'placeholder:text-muted-foreground/40'
            )}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              onClick={clearAll}
            >
              <X className="size-3" />
              Clear
            </Button>
          )}

          <span
            className={cn(
              'text-[11px] tabular-nums transition-colors duration-200',
              isFiltered ? 'text-primary' : 'text-muted-foreground/60'
            )}
          >
            {isFiltered ? (
              <>
                <span className="font-medium">{filteredRows.toLocaleString()}</span>
                <span className="text-muted-foreground/50"> / </span>
                {totalRows.toLocaleString()}
              </>
            ) : (
              <>{totalRows.toLocaleString()} rows</>
            )}
          </span>
        </div>
      </div>

      {hasActiveFilters && onApplyToQuery && (
        <div
          className={cn(
            'flex items-center justify-between px-2.5 py-1 border-b border-amber-500/10 bg-amber-500/[0.03]',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200'
          )}
        >
          <span className="text-[11px] text-amber-400/70">
            Filtering {totalRows.toLocaleString()} loaded rows client-side
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10',
              'motion-safe:animate-pulse motion-safe:[animation-duration:3s] motion-safe:[animation-iteration-count:3]'
            )}
            onClick={onApplyToQuery}
          >
            <DatabaseZap className="size-3" />
            Apply to Query
          </Button>
        </div>
      )}

      {showDropdown && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute left-0 z-50 mt-0.5',
            'w-72 max-h-64 overflow-auto',
            'rounded-lg border border-border/60 bg-popover shadow-lg',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150',
            hasActiveFilters && onApplyToQuery ? 'top-[calc(100%)]' : 'top-full'
          )}
        >
          {builderStep === 'column' && (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider border-b border-border/30">
                {inputValue ? 'Matching columns' : 'Select column'}
              </div>
              {(dropdownItems as FilterColumn[]).length === 0 ? (
                <div className="px-2.5 py-3 text-xs text-muted-foreground/60 text-center">
                  No matching columns
                </div>
              ) : (
                (dropdownItems as FilterColumn[]).map((col, i) => (
                  <button
                    key={col.name}
                    data-highlighted={i === highlightedIndex}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 text-xs',
                      'cursor-pointer transition-colors duration-75',
                      i === highlightedIndex
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground/80 hover:bg-muted/60'
                    )}
                    style={{ animationDelay: `${i * 20}ms` }}
                    onClick={() => selectColumn(col)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <span className="font-medium">{col.name}</span>
                    <span className={cn('text-[10px]', getTypeColor(col.dataType))}>
                      {col.dataType}
                    </span>
                  </button>
                ))
              )}
              {inputValue.trim() && (
                <>
                  <div className="border-t border-border/30" />
                  <button
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs',
                      'cursor-pointer transition-colors duration-75',
                      'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                    onClick={() => {
                      const chip: FilterChip = {
                        id: nextChipId(),
                        column: null,
                        operator: 'contains',
                        value: inputValue.trim()
                      }
                      notifyChange([...chips, chip])
                      cancelBuilding()
                    }}
                  >
                    <Search className="size-3" />
                    Search all columns for &ldquo;{inputValue.trim()}&rdquo;
                  </button>
                </>
              )}
            </>
          )}

          {builderStep === 'operator' && selectedColumn && (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider border-b border-border/30">
                Operator for{' '}
                <span className={getTypeColor(selectedColumn.dataType)}>{selectedColumn.name}</span>
              </div>
              {(dropdownItems as FilterOperator[]).map((op, i) => (
                <button
                  key={op.value}
                  data-highlighted={i === highlightedIndex}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 text-xs',
                    'cursor-pointer transition-colors duration-75',
                    i === highlightedIndex
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground/80 hover:bg-muted/60'
                  )}
                  onClick={() => selectOperator(op)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                >
                  <span className="font-mono font-medium">{op.label}</span>
                  <span className="text-[10px] text-muted-foreground">{op.description}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { chipMatchesRow }
