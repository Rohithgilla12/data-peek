import type { Snippet } from '@shared/index'

export const BUILT_IN_SNIPPETS: Snippet[] = [
  {
    id: 'builtin-select-all',
    name: 'SELECT *',
    description: 'Select all columns from a table',
    template: 'SELECT * FROM ${1:table_name} LIMIT ${2:100};',
    category: 'select',
    isBuiltIn: true,
    triggerPrefix: 'sel',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-select-columns',
    name: 'SELECT columns',
    description: 'Select specific columns from a table',
    template:
      'SELECT ${1:column1}, ${2:column2}\nFROM ${3:table_name}\nWHERE ${4:condition}\nLIMIT ${5:100};',
    category: 'select',
    isBuiltIn: true,
    triggerPrefix: 'selc',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-select-where',
    name: 'SELECT with WHERE',
    description: 'Select with a WHERE clause',
    template: 'SELECT *\nFROM ${1:table_name}\nWHERE ${2:column} = ${3:value}\nLIMIT ${4:100};',
    category: 'select',
    isBuiltIn: true,
    triggerPrefix: 'selw',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-count',
    name: 'COUNT',
    description: 'Count rows in a table',
    template: 'SELECT COUNT(*) FROM ${1:table_name}${2: WHERE condition};',
    category: 'aggregate',
    isBuiltIn: true,
    triggerPrefix: 'cnt',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-group-by',
    name: 'GROUP BY',
    description: 'Group and aggregate data',
    template:
      'SELECT ${1:column}, COUNT(*) AS count\nFROM ${2:table_name}\nGROUP BY ${1:column}\nORDER BY count DESC;',
    category: 'aggregate',
    isBuiltIn: true,
    triggerPrefix: 'grp',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-inner-join',
    name: 'INNER JOIN',
    description: 'Join two tables on matching rows',
    template:
      'SELECT ${1:columns}\nFROM ${2:table1} t1\nINNER JOIN ${3:table2} t2 ON t1.${4:column} = t2.${5:column};',
    category: 'join',
    isBuiltIn: true,
    triggerPrefix: 'ij',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-left-join',
    name: 'LEFT JOIN',
    description: 'Left outer join two tables',
    template:
      'SELECT ${1:columns}\nFROM ${2:table1} t1\nLEFT JOIN ${3:table2} t2 ON t1.${4:column} = t2.${5:column};',
    category: 'join',
    isBuiltIn: true,
    triggerPrefix: 'lj',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-insert',
    name: 'INSERT',
    description: 'Insert a row into a table',
    template:
      'INSERT INTO ${1:table_name} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2});',
    category: 'insert',
    isBuiltIn: true,
    triggerPrefix: 'ins',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-insert-returning',
    name: 'INSERT RETURNING',
    description: 'Insert with returning clause (PostgreSQL)',
    template:
      'INSERT INTO ${1:table_name} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2})\nRETURNING *;',
    category: 'insert',
    isBuiltIn: true,
    triggerPrefix: 'insr',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-update',
    name: 'UPDATE',
    description: 'Update rows in a table',
    template: 'UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
    category: 'update',
    isBuiltIn: true,
    triggerPrefix: 'upd',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-delete',
    name: 'DELETE',
    description: 'Delete rows from a table',
    template: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition};',
    category: 'delete',
    isBuiltIn: true,
    triggerPrefix: 'del',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-create-table',
    name: 'CREATE TABLE',
    description: 'Create a new table',
    template:
      'CREATE TABLE ${1:table_name} (\n  id SERIAL PRIMARY KEY,\n  ${2:column_name} ${3:VARCHAR(255)} ${4:NOT NULL},\n  created_at TIMESTAMP DEFAULT NOW()\n);',
    category: 'ddl',
    isBuiltIn: true,
    triggerPrefix: 'ct',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-alter-add-column',
    name: 'ALTER TABLE ADD COLUMN',
    description: 'Add a column to existing table',
    template: 'ALTER TABLE ${1:table_name}\nADD COLUMN ${2:column_name} ${3:VARCHAR(255)};',
    category: 'ddl',
    isBuiltIn: true,
    triggerPrefix: 'atac',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'builtin-create-index',
    name: 'CREATE INDEX',
    description: 'Create an index on a table',
    template: 'CREATE INDEX ${1:index_name}\nON ${2:table_name} (${3:column_name});',
    category: 'ddl',
    isBuiltIn: true,
    triggerPrefix: 'ci',
    createdAt: 0,
    updatedAt: 0
  }
]

export function getSnippetCategoryColor(category: string): string {
  switch (category) {
    case 'select':
      return 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'insert':
      return 'bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400'
    case 'update':
      return 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
    case 'delete':
      return 'bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400'
    case 'ddl':
      return 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400'
    case 'aggregate':
      return 'bg-orange-500/10 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400'
    case 'join':
      return 'bg-cyan-500/10 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function cleanSnippetTemplate(template: string): string {
  return template.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d+/g, '')
}
