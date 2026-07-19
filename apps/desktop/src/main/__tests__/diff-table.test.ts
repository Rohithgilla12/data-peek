import { describe, it, expect } from 'vitest'
import { diffTableDefinitions } from '@shared/index'
import type { ColumnDefinition, TableDefinition, AlterColumnOperation } from '@shared/index'

function col(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    id: 'col-0',
    name: 'id',
    dataType: 'integer',
    isNullable: false,
    isPrimaryKey: false,
    isUnique: false,
    ...overrides
  }
}

function table(overrides: Partial<TableDefinition> = {}): TableDefinition {
  return {
    schema: 'public',
    name: 'users',
    columns: [col()],
    constraints: [],
    indexes: [],
    ...overrides
  }
}

// Clone so the "edited" definition is a distinct object graph, like the store's
// structuredClone of the loaded definition.
const clone = (t: TableDefinition): TableDefinition => structuredClone(t)

function ops(result: ReturnType<typeof diffTableDefinitions>): AlterColumnOperation[] {
  if (result.kind !== 'batch') throw new Error(`expected batch, got ${result.kind}`)
  return result.batch.columnOperations
}

describe('diffTableDefinitions', () => {
  it('returns noop when nothing changed', () => {
    const original = table()
    expect(diffTableDefinitions(original, clone(original)).kind).toBe('noop')
  })

  it('detects an added column', () => {
    const original = table()
    const edited = clone(original)
    edited.columns.push(col({ id: 'col-new', name: 'email', dataType: 'text', isNullable: true }))
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'add', column: expect.objectContaining({ name: 'email' }) }
    ])
  })

  it('detects a dropped column by its stable id', () => {
    const original = table({
      columns: [col(), col({ id: 'col-1', name: 'email', dataType: 'text' })]
    })
    const edited = clone(original)
    edited.columns = edited.columns.filter((c) => c.id !== 'col-1')
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'drop', columnName: 'email' }
    ])
  })

  it('detects a rename (matched by id, not name heuristics)', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'name' })] })
    const edited = clone(original)
    edited.columns[0].name = 'full_name'
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'rename', oldName: 'name', newName: 'full_name' }
    ])
  })

  it('emits rename before set_type and set_type uses the new name', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'amount', dataType: 'integer' })] })
    const edited = clone(original)
    edited.columns[0].name = 'total'
    edited.columns[0].dataType = 'numeric'
    edited.columns[0].precision = 10
    edited.columns[0].scale = 2
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'rename', oldName: 'amount', newName: 'total' },
      { type: 'set_type', columnName: 'total', newType: 'numeric(10,2)' }
    ])
  })

  it('detects a nullability change', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'name', isNullable: false })] })
    const edited = clone(original)
    edited.columns[0].isNullable = true
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'set_nullable', columnName: 'name', nullable: true }
    ])
  })

  it('sets and drops a default value', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'status', dataType: 'text' })] })
    const setEdited = clone(original)
    setEdited.columns[0].defaultValue = "'active'"
    setEdited.columns[0].defaultType = 'value'
    expect(ops(diffTableDefinitions(original, setEdited))).toEqual([
      { type: 'set_default', columnName: 'status', defaultValue: "'active'" }
    ])

    const withDefault = clone(setEdited)
    const dropEdited = clone(original) // back to no default
    expect(ops(diffTableDefinitions(withDefault, dropEdited))).toEqual([
      { type: 'set_default', columnName: 'status', defaultValue: null }
    ])
  })

  it('renders a sequence default as nextval()', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'id' })] })
    const edited = clone(original)
    edited.columns[0].defaultType = 'sequence'
    edited.columns[0].sequenceName = 'users_id_seq'
    edited.columns[0].defaultValue = 'users_id_seq'
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'set_default', columnName: 'id', defaultValue: "nextval('users_id_seq')" }
    ])
  })

  it('detects a column comment change', () => {
    const original = table({ columns: [col({ id: 'col-0', name: 'email', dataType: 'text' })] })
    const edited = clone(original)
    edited.columns[0].comment = 'primary email'
    expect(ops(diffTableDefinitions(original, edited))).toEqual([
      { type: 'set_comment', columnName: 'email', comment: 'primary email' }
    ])
  })

  it('detects a table comment change', () => {
    const original = table()
    const edited = clone(original)
    edited.comment = 'the users table'
    const result = diffTableDefinitions(original, edited)
    if (result.kind !== 'batch') throw new Error('expected batch')
    expect(result.batch.comment).toBe('the users table')
    expect(result.batch.columnOperations).toEqual([])
  })

  it('treats a bare column reorder as a noop (Postgres cannot reorder columns)', () => {
    const original = table({
      columns: [col({ id: 'col-0', name: 'a' }), col({ id: 'col-1', name: 'b', dataType: 'text' })]
    })
    const edited = clone(original)
    edited.columns.reverse()
    expect(diffTableDefinitions(original, edited).kind).toBe('noop')
  })

  it.each([
    ['table rename', (t: TableDefinition) => (t.name = 'renamed')],
    ['schema move', (t: TableDefinition) => (t.schema = 'archive')],
    ['unlogged toggle', (t: TableDefinition) => (t.unlogged = true)],
    ['primary key toggle', (t: TableDefinition) => (t.columns[0].isPrimaryKey = true)],
    ['unique toggle', (t: TableDefinition) => (t.columns[0].isUnique = true)],
    ['collation change', (t: TableDefinition) => (t.columns[0].collation = 'C')],
    ['check change', (t: TableDefinition) => (t.columns[0].checkConstraint = 'id > 0')],
    [
      'constraint edit',
      (t: TableDefinition) => t.constraints.push({ id: 'c1', type: 'unique', columns: ['id'] })
    ],
    [
      'index edit',
      (t: TableDefinition) =>
        t.indexes.push({ id: 'i1', columns: [{ name: 'id' }], isUnique: false })
    ]
  ])('refuses %s as unsupported (never silently mis-applies)', (_label, mutate) => {
    const original = table()
    const edited = clone(original)
    mutate(edited)
    const result = diffTableDefinitions(original, edited)
    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported') expect(result.reason).toMatch(/SQL query/)
  })
})
