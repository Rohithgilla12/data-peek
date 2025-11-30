import { create } from 'zustand'
import type {
  TableDefinition,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  PostgresDataType
} from '@data-peek/shared'

/**
 * Validation error for table designer
 */
export interface ValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * State for a single table designer tab
 */
interface TabDDLState {
  /** Current table definition being edited */
  definition: TableDefinition
  /** Original definition (for edit mode, to detect changes) */
  originalDefinition: TableDefinition | null
  /** Whether this is a new table or editing existing */
  mode: 'create' | 'edit'
  /** Whether the definition is being loaded from database */
  isLoading: boolean
  /** Whether save is in progress */
  isSaving: boolean
  /** Current validation errors */
  validationErrors: ValidationError[]
  /** Currently selected column ID */
  selectedColumnId: string | null
  /** Currently selected constraint ID */
  selectedConstraintId: string | null
  /** Currently selected index ID */
  selectedIndexId: string | null
  /** SQL preview (cached) */
  sqlPreview: string | null
  /** Last error message */
  error: string | null
}

interface DDLStoreState {
  /** DDL state per tab (key: tabId) */
  tabStates: Map<string, TabDDLState>

  // === Initialization ===
  initTableDesigner: (tabId: string, schemaName: string, tableName?: string) => void
  loadTableDefinition: (tabId: string, definition: TableDefinition) => void
  cleanupTab: (tabId: string) => void

  // === Table-level ===
  setTableName: (tabId: string, name: string) => void
  setTableSchema: (tabId: string, schema: string) => void
  setTableComment: (tabId: string, comment: string | null) => void
  setTableUnlogged: (tabId: string, unlogged: boolean) => void

  // === Column operations ===
  addColumn: (tabId: string) => string
  updateColumn: (tabId: string, columnId: string, updates: Partial<ColumnDefinition>) => void
  removeColumn: (tabId: string, columnId: string) => void
  reorderColumns: (tabId: string, fromIndex: number, toIndex: number) => void
  duplicateColumn: (tabId: string, columnId: string) => string
  selectColumn: (tabId: string, columnId: string | null) => void

  // === Constraint operations ===
  addConstraint: (tabId: string, type: ConstraintDefinition['type']) => string
  updateConstraint: (
    tabId: string,
    constraintId: string,
    updates: Partial<ConstraintDefinition>
  ) => void
  removeConstraint: (tabId: string, constraintId: string) => void
  selectConstraint: (tabId: string, constraintId: string | null) => void

  // === Index operations ===
  addIndex: (tabId: string) => string
  updateIndex: (tabId: string, indexId: string, updates: Partial<IndexDefinition>) => void
  removeIndex: (tabId: string, indexId: string) => void
  selectIndex: (tabId: string, indexId: string | null) => void

  // === State management ===
  setLoading: (tabId: string, isLoading: boolean) => void
  setSaving: (tabId: string, isSaving: boolean) => void
  setError: (tabId: string, error: string | null) => void
  setSqlPreview: (tabId: string, sql: string | null) => void
  resetToOriginal: (tabId: string) => void

  // === Getters ===
  getState: (tabId: string) => TabDDLState | undefined
  getDefinition: (tabId: string) => TableDefinition | undefined
  isDirty: (tabId: string) => boolean
  validate: (tabId: string) => ValidationError[]
  getSelectedColumn: (tabId: string) => ColumnDefinition | undefined
}

function createEmptyTableDefinition(schema: string, name: string = ''): TableDefinition {
  return {
    schema,
    name,
    columns: [],
    constraints: [],
    indexes: []
  }
}

function createDefaultColumn(): ColumnDefinition {
  return {
    id: crypto.randomUUID(),
    name: '',
    dataType: 'text' as PostgresDataType,
    isNullable: true,
    isPrimaryKey: false,
    isUnique: false
  }
}

function getInitialTabState(schemaName: string, mode: 'create' | 'edit'): TabDDLState {
  return {
    definition: createEmptyTableDefinition(schemaName),
    originalDefinition: null,
    mode,
    isLoading: mode === 'edit',
    isSaving: false,
    validationErrors: [],
    selectedColumnId: null,
    selectedConstraintId: null,
    selectedIndexId: null,
    sqlPreview: null,
    error: null
  }
}

/**
 * Deep compare two table definitions to check for changes
 */
function definitionsEqual(a: TableDefinition | null, b: TableDefinition | null): boolean {
  if (a === null || b === null) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Validate a table definition
 */
function validateDefinition(definition: TableDefinition): ValidationError[] {
  const errors: ValidationError[] = []

  // Table name validation
  if (!definition.name.trim()) {
    errors.push({ field: 'name', message: 'Table name is required', severity: 'error' })
  } else if (!/^[a-z_][a-z0-9_]*$/i.test(definition.name)) {
    errors.push({
      field: 'name',
      message: 'Table name must start with a letter or underscore',
      severity: 'error'
    })
  }

  // Must have at least one column
  if (definition.columns.length === 0) {
    errors.push({
      field: 'columns',
      message: 'Table must have at least one column',
      severity: 'error'
    })
  }

  // Column validation
  const columnNames = new Set<string>()
  definition.columns.forEach((col, index) => {
    if (!col.name.trim()) {
      errors.push({
        field: `column.${col.id}.name`,
        message: `Column ${index + 1} name is required`,
        severity: 'error'
      })
    } else if (columnNames.has(col.name.toLowerCase())) {
      errors.push({
        field: `column.${col.id}.name`,
        message: `Duplicate column name: ${col.name}`,
        severity: 'error'
      })
    } else {
      columnNames.add(col.name.toLowerCase())
    }

    if (!col.dataType) {
      errors.push({
        field: `column.${col.id}.dataType`,
        message: `Column ${col.name || index + 1} requires a data type`,
        severity: 'error'
      })
    }

    // varchar/char length validation
    if ((col.dataType === 'varchar' || col.dataType === 'char') && col.length !== undefined) {
      if (col.length <= 0) {
        errors.push({
          field: `column.${col.id}.length`,
          message: `${col.name}: Length must be positive`,
          severity: 'error'
        })
      }
    }

    // numeric precision/scale validation
    if (col.dataType === 'numeric') {
      if (col.precision !== undefined && col.precision <= 0) {
        errors.push({
          field: `column.${col.id}.precision`,
          message: `${col.name}: Precision must be positive`,
          severity: 'error'
        })
      }
      if (col.scale !== undefined && col.precision !== undefined && col.scale > col.precision) {
        errors.push({
          field: `column.${col.id}.scale`,
          message: `${col.name}: Scale cannot exceed precision`,
          severity: 'error'
        })
      }
    }
  })

  // Primary key validation
  const pkColumns = definition.columns.filter((c) => c.isPrimaryKey)
  if (pkColumns.length === 0) {
    errors.push({
      field: 'primaryKey',
      message: 'Table should have a primary key',
      severity: 'warning'
    })
  }

  // Check if any PK columns are nullable
  pkColumns.forEach((col) => {
    if (col.isNullable) {
      errors.push({
        field: `column.${col.id}.isNullable`,
        message: `Primary key column ${col.name} cannot be nullable`,
        severity: 'error'
      })
    }
  })

  // Constraint validation
  definition.constraints.forEach((constraint) => {
    if (constraint.type === 'foreign_key') {
      if (!constraint.referencedTable) {
        errors.push({
          field: `constraint.${constraint.id}.referencedTable`,
          message: 'Foreign key must reference a table',
          severity: 'error'
        })
      }
      if (!constraint.columns.length) {
        errors.push({
          field: `constraint.${constraint.id}.columns`,
          message: 'Foreign key must have at least one column',
          severity: 'error'
        })
      }
    }

    if (constraint.type === 'check' && !constraint.checkExpression?.trim()) {
      errors.push({
        field: `constraint.${constraint.id}.checkExpression`,
        message: 'CHECK constraint requires an expression',
        severity: 'error'
      })
    }
  })

  // Index validation
  definition.indexes.forEach((index) => {
    if (!index.columns.length) {
      // For existing indexes (those with a name from the database), treat as warning
      // They may be expression indexes that we couldn't fully parse
      const isExistingIndex = !!index.name
      errors.push({
        field: `index.${index.id}.columns`,
        message: isExistingIndex
          ? `Index "${index.name}" has no parseable columns (may be an expression index)`
          : 'Index must have at least one column',
        severity: isExistingIndex ? 'warning' : 'error'
      })
    }
  })

  return errors
}

export const useDDLStore = create<DDLStoreState>()((set, get) => ({
  tabStates: new Map(),

  initTableDesigner: (tabId, schemaName, tableName) => {
    const mode = tableName ? 'edit' : 'create'
    set((state) => {
      const newStates = new Map(state.tabStates)
      newStates.set(tabId, getInitialTabState(schemaName, mode))
      return { tabStates: newStates }
    })
  },

  loadTableDefinition: (tabId, definition) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: { ...definition },
          originalDefinition: JSON.parse(JSON.stringify(definition)),
          isLoading: false,
          error: null
        })
      }
      return { tabStates: newStates }
    })
  },

  cleanupTab: (tabId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      newStates.delete(tabId)
      return { tabStates: newStates }
    })
  },

  setTableName: (tabId, name) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, name },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  setTableSchema: (tabId, schema) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, schema },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  setTableComment: (tabId, comment) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, comment: comment ?? undefined },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  setTableUnlogged: (tabId, unlogged) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, unlogged },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  addColumn: (tabId) => {
    const newColumn = createDefaultColumn()
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: {
            ...existing.definition,
            columns: [...existing.definition.columns, newColumn]
          },
          selectedColumnId: newColumn.id,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
    return newColumn.id
  },

  updateColumn: (tabId, columnId, updates) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const columns = existing.definition.columns.map((col) =>
          col.id === columnId ? { ...col, ...updates } : col
        )
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, columns },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  removeColumn: (tabId, columnId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const columns = existing.definition.columns.filter((col) => col.id !== columnId)
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, columns },
          selectedColumnId:
            existing.selectedColumnId === columnId ? null : existing.selectedColumnId,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  reorderColumns: (tabId, fromIndex, toIndex) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const columns = [...existing.definition.columns]
        const [removed] = columns.splice(fromIndex, 1)
        columns.splice(toIndex, 0, removed)
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, columns },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  duplicateColumn: (tabId, columnId) => {
    const newId = crypto.randomUUID()
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const sourceColumn = existing.definition.columns.find((c) => c.id === columnId)
        if (sourceColumn) {
          const newColumn: ColumnDefinition = {
            ...sourceColumn,
            id: newId,
            name: `${sourceColumn.name}_copy`,
            isPrimaryKey: false // Don't duplicate PK
          }
          const sourceIndex = existing.definition.columns.findIndex((c) => c.id === columnId)
          const columns = [...existing.definition.columns]
          columns.splice(sourceIndex + 1, 0, newColumn)
          newStates.set(tabId, {
            ...existing,
            definition: { ...existing.definition, columns },
            selectedColumnId: newId,
            sqlPreview: null
          })
        }
      }
      return { tabStates: newStates }
    })
    return newId
  },

  selectColumn: (tabId, columnId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          selectedColumnId: columnId,
          selectedConstraintId: null,
          selectedIndexId: null
        })
      }
      return { tabStates: newStates }
    })
  },

  addConstraint: (tabId, type) => {
    const newConstraint: ConstraintDefinition = {
      id: crypto.randomUUID(),
      type,
      columns: []
    }
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: {
            ...existing.definition,
            constraints: [...existing.definition.constraints, newConstraint]
          },
          selectedConstraintId: newConstraint.id,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
    return newConstraint.id
  },

  updateConstraint: (tabId, constraintId, updates) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const constraints = existing.definition.constraints.map((c) =>
          c.id === constraintId ? { ...c, ...updates } : c
        )
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, constraints },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  removeConstraint: (tabId, constraintId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const constraints = existing.definition.constraints.filter((c) => c.id !== constraintId)
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, constraints },
          selectedConstraintId:
            existing.selectedConstraintId === constraintId ? null : existing.selectedConstraintId,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  selectConstraint: (tabId, constraintId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          selectedColumnId: null,
          selectedConstraintId: constraintId,
          selectedIndexId: null
        })
      }
      return { tabStates: newStates }
    })
  },

  addIndex: (tabId) => {
    const newIndex: IndexDefinition = {
      id: crypto.randomUUID(),
      columns: [],
      isUnique: false
    }
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          definition: {
            ...existing.definition,
            indexes: [...existing.definition.indexes, newIndex]
          },
          selectedIndexId: newIndex.id,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
    return newIndex.id
  },

  updateIndex: (tabId, indexId, updates) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const indexes = existing.definition.indexes.map((idx) =>
          idx.id === indexId ? { ...idx, ...updates } : idx
        )
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, indexes },
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  removeIndex: (tabId, indexId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        const indexes = existing.definition.indexes.filter((idx) => idx.id !== indexId)
        newStates.set(tabId, {
          ...existing,
          definition: { ...existing.definition, indexes },
          selectedIndexId: existing.selectedIndexId === indexId ? null : existing.selectedIndexId,
          sqlPreview: null
        })
      }
      return { tabStates: newStates }
    })
  },

  selectIndex: (tabId, indexId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, {
          ...existing,
          selectedColumnId: null,
          selectedConstraintId: null,
          selectedIndexId: indexId
        })
      }
      return { tabStates: newStates }
    })
  },

  setLoading: (tabId, isLoading) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, { ...existing, isLoading })
      }
      return { tabStates: newStates }
    })
  },

  setSaving: (tabId, isSaving) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, { ...existing, isSaving })
      }
      return { tabStates: newStates }
    })
  },

  setError: (tabId, error) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, { ...existing, error })
      }
      return { tabStates: newStates }
    })
  },

  setSqlPreview: (tabId, sql) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, { ...existing, sqlPreview: sql })
      }
      return { tabStates: newStates }
    })
  },

  resetToOriginal: (tabId) => {
    set((state) => {
      const newStates = new Map(state.tabStates)
      const existing = newStates.get(tabId)
      if (existing && existing.originalDefinition) {
        newStates.set(tabId, {
          ...existing,
          definition: JSON.parse(JSON.stringify(existing.originalDefinition)),
          sqlPreview: null,
          validationErrors: []
        })
      }
      return { tabStates: newStates }
    })
  },

  getState: (tabId) => {
    return get().tabStates.get(tabId)
  },

  getDefinition: (tabId) => {
    return get().tabStates.get(tabId)?.definition
  },

  isDirty: (tabId) => {
    const state = get().tabStates.get(tabId)
    if (!state) return false
    if (state.mode === 'create') {
      // For create mode, dirty if there are columns or table has a name
      return state.definition.columns.length > 0 || state.definition.name.trim() !== ''
    }
    return !definitionsEqual(state.definition, state.originalDefinition)
  },

  validate: (tabId) => {
    const state = get().tabStates.get(tabId)
    if (!state) return []

    const errors = validateDefinition(state.definition)

    // Update stored validation errors
    set((s) => {
      const newStates = new Map(s.tabStates)
      const existing = newStates.get(tabId)
      if (existing) {
        newStates.set(tabId, { ...existing, validationErrors: errors })
      }
      return { tabStates: newStates }
    })

    return errors
  },

  getSelectedColumn: (tabId) => {
    const state = get().tabStates.get(tabId)
    if (!state || !state.selectedColumnId) return undefined
    return state.definition.columns.find((c) => c.id === state.selectedColumnId)
  }
}))
