export interface Notebook {
  id: string
  title: string
  connectionId: string
  folder: string | null
  createdAt: number
  updatedAt: number
}

export interface NotebookCell {
  id: string
  notebookId: string
  type: 'sql' | 'markdown'
  content: string
  pinnedResult: PinnedResult | null
  order: number
  createdAt: number
  updatedAt: number
}

export interface PinnedResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executedAt: number
  durationMs: number
  error: string | null
}

export interface NotebookWithCells extends Notebook {
  cells: NotebookCell[]
}

export interface CreateNotebookInput {
  title: string
  connectionId: string
  folder?: string | null
}

export interface UpdateNotebookInput {
  title?: string
  folder?: string | null
}

export interface AddCellInput {
  type: 'sql' | 'markdown'
  content: string
  order: number
}

export interface UpdateCellInput {
  content?: string
  pinnedResult?: PinnedResult | null
}

export const MAX_PINNED_ROWS = 500
