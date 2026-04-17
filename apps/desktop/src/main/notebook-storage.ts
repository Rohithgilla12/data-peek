import { randomUUID } from 'crypto'
import { join } from 'path'
import Database from 'better-sqlite3'
import type {
  Notebook,
  NotebookCell,
  NotebookWithCells,
  PinnedResult,
  CreateNotebookInput,
  UpdateNotebookInput,
  AddCellInput,
  UpdateCellInput
} from '@shared/index'
import { createLogger } from './lib/logger'

const log = createLogger('notebook-storage')

interface NotebookRow {
  id: string
  title: string
  connection_id: string
  folder: string | null
  created_at: number
  updated_at: number
}

interface CellRow {
  id: string
  notebook_id: string
  type: 'sql' | 'markdown'
  content: string
  pinned_result: string | null
  order_index: number
  created_at: number
  updated_at: number
}

function rowToNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    title: row.title,
    connectionId: row.connection_id,
    folder: row.folder,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parsePinnedResult(raw: string): PinnedResult | null {
  try {
    return JSON.parse(raw) as PinnedResult
  } catch {
    log.warn('Corrupt pinned_result JSON, falling back to null')
    return null
  }
}

function rowToCell(row: CellRow): NotebookCell {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    type: row.type,
    content: row.content,
    pinnedResult: row.pinned_result ? parsePinnedResult(row.pinned_result) : null,
    order: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class NotebookStorage {
  private db: Database.Database

  constructor(userDataPath: string) {
    const dbPath = join(userDataPath, 'notebooks.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
    log.info('NotebookStorage initialised', dbPath)
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        folder TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notebook_cells (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('sql', 'markdown')),
        content TEXT NOT NULL DEFAULT '',
        pinned_result TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notebook_cells_notebook_id ON notebook_cells(notebook_id);
      CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at ON notebooks(updated_at DESC);
    `)
  }

  private touchNotebook(id: string): void {
    const now = Date.now()
    this.db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, id)
  }

  listNotebooks(): Notebook[] {
    const rows = this.db
      .prepare('SELECT * FROM notebooks ORDER BY updated_at DESC')
      .all() as NotebookRow[]
    return rows.map(rowToNotebook)
  }

  getNotebook(id: string): NotebookWithCells | null {
    const notebookRow = this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as
      | NotebookRow
      | undefined

    if (!notebookRow) return null

    const cellRows = this.db
      .prepare('SELECT * FROM notebook_cells WHERE notebook_id = ? ORDER BY order_index ASC')
      .all(id) as CellRow[]

    return {
      ...rowToNotebook(notebookRow),
      cells: cellRows.map(rowToCell)
    }
  }

  createNotebook(input: CreateNotebookInput): Notebook {
    const now = Date.now()
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO notebooks (id, title, connection_id, folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.title, input.connectionId, input.folder ?? null, now, now)
    log.debug('Created notebook', id)
    return rowToNotebook(
      this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as NotebookRow
    )
  }

  updateNotebook(id: string, input: UpdateNotebookInput): Notebook | null {
    const existing = this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as
      | NotebookRow
      | undefined
    if (!existing) return null

    const now = Date.now()
    const title = input.title !== undefined ? input.title : existing.title
    const folder = input.folder !== undefined ? input.folder : existing.folder

    this.db
      .prepare('UPDATE notebooks SET title = ?, folder = ?, updated_at = ? WHERE id = ?')
      .run(title, folder, now, id)

    return rowToNotebook(
      this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as NotebookRow
    )
  }

  deleteNotebook(id: string): void {
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(id)
    log.debug('Deleted notebook', id)
  }

  duplicateNotebook(id: string, targetConnectionId: string): Notebook | null {
    const original = this.getNotebook(id)
    if (!original) return null

    const duplicateInTransaction = this.db.transaction(() => {
      const now = Date.now()
      const newNotebookId = randomUUID()

      this.db
        .prepare(
          'INSERT INTO notebooks (id, title, connection_id, folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(newNotebookId, original.title, targetConnectionId, original.folder, now, now)

      for (const cell of original.cells) {
        const newCellId = randomUUID()
        this.db
          .prepare(
            'INSERT INTO notebook_cells (id, notebook_id, type, content, pinned_result, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            newCellId,
            newNotebookId,
            cell.type,
            cell.content,
            cell.pinnedResult ? JSON.stringify(cell.pinnedResult) : null,
            cell.order,
            now,
            now
          )
      }

      return newNotebookId
    })

    const newId = duplicateInTransaction()
    log.debug('Duplicated notebook', id, '->', newId)
    return rowToNotebook(
      this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(newId) as NotebookRow
    )
  }

  addCell(notebookId: string, input: AddCellInput): NotebookCell {
    const now = Date.now()
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO notebook_cells (id, notebook_id, type, content, pinned_result, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, notebookId, input.type, input.content, null, input.order, now, now)
    this.touchNotebook(notebookId)
    log.debug('Added cell', id, 'to notebook', notebookId)
    return rowToCell(
      this.db.prepare('SELECT * FROM notebook_cells WHERE id = ?').get(id) as CellRow
    )
  }

  updateCell(id: string, input: UpdateCellInput): NotebookCell | null {
    const existing = this.db.prepare('SELECT * FROM notebook_cells WHERE id = ?').get(id) as
      | CellRow
      | undefined
    if (!existing) return null

    const now = Date.now()
    const content = input.content !== undefined ? input.content : existing.content
    const pinnedResult =
      input.pinnedResult !== undefined
        ? input.pinnedResult === null
          ? null
          : JSON.stringify(input.pinnedResult)
        : existing.pinned_result

    this.db
      .prepare(
        'UPDATE notebook_cells SET content = ?, pinned_result = ?, updated_at = ? WHERE id = ?'
      )
      .run(content, pinnedResult, now, id)

    this.touchNotebook(existing.notebook_id)
    return rowToCell(
      this.db.prepare('SELECT * FROM notebook_cells WHERE id = ?').get(id) as CellRow
    )
  }

  deleteCell(id: string): void {
    const cell = this.db.prepare('SELECT * FROM notebook_cells WHERE id = ?').get(id) as
      | CellRow
      | undefined
    if (!cell) return
    this.db.prepare('DELETE FROM notebook_cells WHERE id = ?').run(id)
    this.touchNotebook(cell.notebook_id)
    log.debug('Deleted cell', id)
  }

  reorderCells(notebookId: string, orderedIds: string[]): void {
    const reorderInTransaction = this.db.transaction(() => {
      for (let i = 0; i < orderedIds.length; i++) {
        this.db
          .prepare('UPDATE notebook_cells SET order_index = ? WHERE id = ? AND notebook_id = ?')
          .run(i, orderedIds[i], notebookId)
      }
      this.touchNotebook(notebookId)
    })
    reorderInTransaction()
    log.debug('Reordered cells for notebook', notebookId)
  }

  close(): void {
    this.db.close()
  }
}
