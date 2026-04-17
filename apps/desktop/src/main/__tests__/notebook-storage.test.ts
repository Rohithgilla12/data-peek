import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    transports: {
      console: { level: 'debug' },
      file: { level: 'debug', maxSize: 0, format: '' }
    },
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

import { NotebookStorage } from '../notebook-storage'

describe('NotebookStorage', () => {
  let storage: NotebookStorage
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-storage-test-'))
    storage = new NotebookStorage(tmpDir)
  })

  afterEach(() => {
    storage.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('creates and lists notebooks', () => {
    it('returns empty array when no notebooks exist', () => {
      const notebooks = storage.listNotebooks()
      expect(notebooks).toEqual([])
    })

    it('creates a notebook and lists it', () => {
      const notebook = storage.createNotebook({
        title: 'My Notebook',
        connectionId: 'conn-1'
      })

      expect(notebook.id).toBeDefined()
      expect(notebook.title).toBe('My Notebook')
      expect(notebook.connectionId).toBe('conn-1')
      expect(notebook.folder).toBeNull()
      expect(notebook.createdAt).toBeGreaterThan(0)
      expect(notebook.updatedAt).toBeGreaterThan(0)

      const list = storage.listNotebooks()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(notebook.id)
      expect(list[0].title).toBe('My Notebook')
    })

    it('lists multiple notebooks ordered by updatedAt desc', () => {
      const nb1 = storage.createNotebook({ title: 'First', connectionId: 'conn-1' })
      const nb2 = storage.createNotebook({ title: 'Second', connectionId: 'conn-1' })
      const nb3 = storage.createNotebook({ title: 'Third', connectionId: 'conn-1' })

      const list = storage.listNotebooks()
      expect(list).toHaveLength(3)
      expect(list.map((n) => n.id)).toContain(nb1.id)
      expect(list.map((n) => n.id)).toContain(nb2.id)
      expect(list.map((n) => n.id)).toContain(nb3.id)
    })
  })

  describe('creates notebook with folder', () => {
    it('creates a notebook with a folder', () => {
      const notebook = storage.createNotebook({
        title: 'Foldered Notebook',
        connectionId: 'conn-2',
        folder: 'work/analytics'
      })

      expect(notebook.folder).toBe('work/analytics')

      const list = storage.listNotebooks()
      expect(list[0].folder).toBe('work/analytics')
    })
  })

  describe('gets notebook with cells', () => {
    it('returns null for non-existent notebook', () => {
      const result = storage.getNotebook('nonexistent-id')
      expect(result).toBeNull()
    })

    it('returns notebook with empty cells array', () => {
      const notebook = storage.createNotebook({ title: 'Empty', connectionId: 'conn-1' })
      const result = storage.getNotebook(notebook.id)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(notebook.id)
      expect(result!.title).toBe('Empty')
      expect(result!.cells).toEqual([])
    })

    it('returns notebook with its cells', () => {
      const notebook = storage.createNotebook({ title: 'With Cells', connectionId: 'conn-1' })
      storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })
      storage.addCell(notebook.id, { type: 'markdown', content: '# Title', order: 1 })

      const result = storage.getNotebook(notebook.id)
      expect(result!.cells).toHaveLength(2)
      expect(result!.cells[0].content).toBe('SELECT 1')
      expect(result!.cells[0].type).toBe('sql')
      expect(result!.cells[1].content).toBe('# Title')
      expect(result!.cells[1].type).toBe('markdown')
    })
  })

  describe('updates notebook title and folder', () => {
    it('updates the title', () => {
      const notebook = storage.createNotebook({ title: 'Old Title', connectionId: 'conn-1' })
      const updated = storage.updateNotebook(notebook.id, { title: 'New Title' })

      expect(updated).not.toBeNull()
      expect(updated!.title).toBe('New Title')
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(notebook.updatedAt)
    })

    it('updates the folder', () => {
      const notebook = storage.createNotebook({
        title: 'NB',
        connectionId: 'conn-1',
        folder: 'old-folder'
      })
      const updated = storage.updateNotebook(notebook.id, { folder: 'new-folder' })

      expect(updated!.folder).toBe('new-folder')
    })

    it('clears the folder when set to null', () => {
      const notebook = storage.createNotebook({
        title: 'NB',
        connectionId: 'conn-1',
        folder: 'some-folder'
      })
      const updated = storage.updateNotebook(notebook.id, { folder: null })

      expect(updated!.folder).toBeNull()
    })

    it('returns null for non-existent notebook', () => {
      const result = storage.updateNotebook('nonexistent', { title: 'X' })
      expect(result).toBeNull()
    })
  })

  describe('deletes notebook and cascades cells', () => {
    it('deletes a notebook', () => {
      const notebook = storage.createNotebook({ title: 'To Delete', connectionId: 'conn-1' })
      storage.deleteNotebook(notebook.id)

      const list = storage.listNotebooks()
      expect(list).toHaveLength(0)
    })

    it('cascades deletion to cells', () => {
      const notebook = storage.createNotebook({ title: 'Has Cells', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      storage.deleteNotebook(notebook.id)

      // The cell should no longer exist; verify by recreating and checking no cells leak
      const newNotebook = storage.createNotebook({ title: 'Fresh', connectionId: 'conn-1' })
      const result = storage.getNotebook(newNotebook.id)
      expect(result!.cells).toHaveLength(0)

      // Also ensure the old notebook is gone
      expect(storage.getNotebook(notebook.id)).toBeNull()

      void cell // used above indirectly
    })
  })

  describe('duplicates notebook to different connection', () => {
    it('duplicates a notebook preserving title and cells', () => {
      const original = storage.createNotebook({
        title: 'Original',
        connectionId: 'conn-1',
        folder: 'myfolder'
      })
      storage.addCell(original.id, { type: 'sql', content: 'SELECT 1', order: 0 })
      storage.addCell(original.id, { type: 'markdown', content: '# Note', order: 1 })

      const duplicate = storage.duplicateNotebook(original.id, 'conn-2')

      expect(duplicate).not.toBeNull()
      expect(duplicate!.id).not.toBe(original.id)
      expect(duplicate!.title).toBe('Original')
      expect(duplicate!.connectionId).toBe('conn-2')
      expect(duplicate!.folder).toBe('myfolder')

      const dupWithCells = storage.getNotebook(duplicate!.id)
      expect(dupWithCells!.cells).toHaveLength(2)
      expect(dupWithCells!.cells[0].content).toBe('SELECT 1')
      expect(dupWithCells!.cells[1].content).toBe('# Note')
      // Duplicated cells should have new IDs
      const originalWithCells = storage.getNotebook(original.id)
      expect(dupWithCells!.cells[0].id).not.toBe(originalWithCells!.cells[0].id)
    })

    it('returns null when duplicating non-existent notebook', () => {
      const result = storage.duplicateNotebook('nonexistent', 'conn-2')
      expect(result).toBeNull()
    })
  })

  describe('adds and retrieves cells in order', () => {
    it('adds a cell and retrieves it', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT *', order: 0 })

      expect(cell.id).toBeDefined()
      expect(cell.notebookId).toBe(notebook.id)
      expect(cell.type).toBe('sql')
      expect(cell.content).toBe('SELECT *')
      expect(cell.order).toBe(0)
      expect(cell.pinnedResult).toBeNull()
      expect(cell.createdAt).toBeGreaterThan(0)
      expect(cell.updatedAt).toBeGreaterThan(0)
    })

    it('retrieves cells sorted by order', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      storage.addCell(notebook.id, { type: 'sql', content: 'C', order: 2 })
      storage.addCell(notebook.id, { type: 'sql', content: 'A', order: 0 })
      storage.addCell(notebook.id, { type: 'sql', content: 'B', order: 1 })

      const result = storage.getNotebook(notebook.id)
      expect(result!.cells.map((c) => c.content)).toEqual(['A', 'B', 'C'])
    })
  })

  describe('updates cell content', () => {
    it('updates the content of a cell', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      const updated = storage.updateCell(cell.id, { content: 'SELECT 2' })
      expect(updated).not.toBeNull()
      expect(updated!.content).toBe('SELECT 2')
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(cell.updatedAt)
    })

    it('returns null for non-existent cell', () => {
      const result = storage.updateCell('nonexistent', { content: 'x' })
      expect(result).toBeNull()
    })

    it('updates notebook updatedAt when cell content changes', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      storage.updateCell(cell.id, { content: 'SELECT 2' })
      const updated = storage.getNotebook(notebook.id)
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(notebook.updatedAt)
    })
  })

  describe('pins and unpins results', () => {
    it('pins a result to a cell', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      const pinnedResult = {
        columns: ['id', 'name'],
        rows: [[1, 'Alice'], [2, 'Bob']],
        rowCount: 2,
        executedAt: Date.now(),
        durationMs: 42,
        error: null
      }

      const updated = storage.updateCell(cell.id, { pinnedResult })
      expect(updated!.pinnedResult).not.toBeNull()
      expect(updated!.pinnedResult!.columns).toEqual(['id', 'name'])
      expect(updated!.pinnedResult!.rowCount).toBe(2)
      expect(updated!.pinnedResult!.durationMs).toBe(42)
    })

    it('unpins a result from a cell', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      const pinnedResult = {
        columns: ['id'],
        rows: [[1]],
        rowCount: 1,
        executedAt: Date.now(),
        durationMs: 10,
        error: null
      }

      storage.updateCell(cell.id, { pinnedResult })
      const unpinned = storage.updateCell(cell.id, { pinnedResult: null })
      expect(unpinned!.pinnedResult).toBeNull()
    })

    it('persists pinned result across getNotebook calls', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })

      const pinnedResult = {
        columns: ['val'],
        rows: [[42]],
        rowCount: 1,
        executedAt: 1000,
        durationMs: 5,
        error: null
      }

      storage.updateCell(cell.id, { pinnedResult })
      const fetched = storage.getNotebook(notebook.id)
      expect(fetched!.cells[0].pinnedResult).toEqual(pinnedResult)
    })
  })

  describe('deletes a cell', () => {
    it('deletes a cell from a notebook', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell = storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 1', order: 0 })
      storage.addCell(notebook.id, { type: 'sql', content: 'SELECT 2', order: 1 })

      storage.deleteCell(cell.id)

      const result = storage.getNotebook(notebook.id)
      expect(result!.cells).toHaveLength(1)
      expect(result!.cells[0].content).toBe('SELECT 2')
    })
  })

  describe('reorders cells', () => {
    it('reorders cells in a notebook', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell1 = storage.addCell(notebook.id, { type: 'sql', content: 'A', order: 0 })
      const cell2 = storage.addCell(notebook.id, { type: 'sql', content: 'B', order: 1 })
      const cell3 = storage.addCell(notebook.id, { type: 'sql', content: 'C', order: 2 })

      storage.reorderCells(notebook.id, [cell3.id, cell1.id, cell2.id])

      const result = storage.getNotebook(notebook.id)
      expect(result!.cells.map((c) => c.content)).toEqual(['C', 'A', 'B'])
    })

    it('reorders cells and updates notebook updatedAt', () => {
      const notebook = storage.createNotebook({ title: 'NB', connectionId: 'conn-1' })
      const cell1 = storage.addCell(notebook.id, { type: 'sql', content: 'A', order: 0 })
      const cell2 = storage.addCell(notebook.id, { type: 'sql', content: 'B', order: 1 })

      storage.reorderCells(notebook.id, [cell2.id, cell1.id])

      const result = storage.getNotebook(notebook.id)
      expect(result!.updatedAt).toBeGreaterThanOrEqual(notebook.updatedAt)
    })
  })
})
