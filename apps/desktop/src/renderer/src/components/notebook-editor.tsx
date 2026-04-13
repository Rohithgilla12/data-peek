import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, Play } from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import { useNotebookStore } from '@/stores/notebook-store'
import { useConnectionStore } from '@/stores/connection-store'
import { NotebookCell } from './notebook-cell'
import type { NotebookTab } from '@/stores/tab-store'

interface NotebookEditorProps {
  tab: NotebookTab
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function NotebookEditor({ tab }: NotebookEditorProps) {
  const [focusedCellIndex, setFocusedCellIndex] = useState<number>(0)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const activeNotebook = useNotebookStore((s) => s.activeNotebook)
  const isLoading = useNotebookStore((s) => s.isLoading)
  const lastSavedAt = useNotebookStore((s) => s.lastSavedAt)
  const loadNotebook = useNotebookStore((s) => s.loadNotebook)
  const addCell = useNotebookStore((s) => s.addCell)
  const deleteCell = useNotebookStore((s) => s.deleteCell)
  const updateNotebook = useNotebookStore((s) => s.updateNotebook)

  const connections = useConnectionStore((s) => s.connections)
  const connectionId = tab.connectionId
  const connection = connections.find((c) => c.id === connectionId) ?? null

  useEffect(() => {
    loadNotebook(tab.notebookId)
  }, [tab.notebookId, loadNotebook])

  useEffect(() => {
    if (activeNotebook) {
      setTitleValue(activeNotebook.title)
    }
  }, [activeNotebook?.title])

  const cells = activeNotebook?.cells ?? []

  const handleAddCell = useCallback(
    (type: 'sql' | 'markdown', insertAfterIndex?: number) => {
      if (!activeNotebook) return
      const order =
        insertAfterIndex !== undefined && cells[insertAfterIndex]
          ? cells[insertAfterIndex].order + 0.5
          : cells.length
      addCell(activeNotebook.id, { type, content: '', order })
      setFocusedCellIndex(
        insertAfterIndex !== undefined ? insertAfterIndex + 1 : cells.length
      )
    },
    [activeNotebook, cells, addCell]
  )

  const handleDeleteCell = useCallback(
    (cellId: string, index: number) => {
      deleteCell(cellId)
      setFocusedCellIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev))
    },
    [deleteCell]
  )

  const handleTitleEdit = useCallback(() => {
    if (activeNotebook) {
      setTitleValue(activeNotebook.title)
      setIsEditingTitle(true)
    }
  }, [activeNotebook])

  const handleTitleSave = useCallback(() => {
    if (activeNotebook && titleValue.trim()) {
      updateNotebook(activeNotebook.id, { title: titleValue.trim() })
    }
    setIsEditingTitle(false)
  }, [activeNotebook, titleValue, updateNotebook])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleTitleSave()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditingTitle(false)
      }
    },
    [handleTitleSave]
  )

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'j') {
        e.preventDefault()
        setFocusedCellIndex((prev) => Math.min(prev + 1, cells.length - 1))
      } else if (e.key === 'k') {
        e.preventDefault()
        setFocusedCellIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.shiftKey && e.key === 'D') {
        e.preventDefault()
        const cell = cells[focusedCellIndex]
        if (cell) {
          handleDeleteCell(cell.id, focusedCellIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cells, focusedCellIndex, handleDeleteCell])

  if (isLoading && !activeNotebook) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading notebook…</p>
      </div>
    )
  }

  if (!activeNotebook) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Notebook not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="font-medium text-sm bg-transparent outline-none border-b border-primary/50 min-w-[120px] max-w-[300px]"
          />
        ) : (
          <button
            onClick={handleTitleEdit}
            className="font-medium text-sm hover:text-foreground/80 transition-colors cursor-text"
          >
            {activeNotebook.title}
          </button>
        )}

        {connection && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
            {connection.name}
          </span>
        )}

        {lastSavedAt && (
          <span className="text-[10px] text-muted-foreground">
            Saved {formatTimeAgo(lastSavedAt)}
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => handleAddCell('sql')}
        >
          <Plus className="size-3" />
          SQL
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => handleAddCell('markdown')}
        >
          <Plus className="size-3" />
          Note
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setFocusedCellIndex(0)}
        >
          <Play className="size-3" />
          Run All
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-16">
        {cells.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">
              Empty notebook. Add your first cell.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleAddCell('sql')}
              >
                <Plus className="size-3" />
                SQL cell
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleAddCell('markdown')}
              >
                <Plus className="size-3" />
                Note cell
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-w-4xl mx-auto">
            <InsertPoint onInsert={(type) => handleAddCell(type, -1)} />
            {cells.map((cell, index) => (
              <div key={cell.id} className="flex flex-col">
                <NotebookCell
                  cell={cell}
                  connectionId={connectionId ?? ''}
                  isFocused={focusedCellIndex === index}
                  onFocus={() => setFocusedCellIndex(index)}
                  onRunAndAdvance={() =>
                    setFocusedCellIndex(Math.min(index + 1, cells.length - 1))
                  }
                  onDelete={() => handleDeleteCell(cell.id, index)}
                />
                <InsertPoint onInsert={(type) => handleAddCell(type, index)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-4 px-4 py-1.5 border-t border-border/30 bg-background/80 backdrop-blur-sm text-[10px] text-muted-foreground/60 pointer-events-none z-20">
        <span>⇧⏎ Run &amp; advance</span>
        <span>⌘⏎ Run cell</span>
        <span>⌘J/⌘K Navigate</span>
        <span>Esc Exit editor</span>
      </div>
    </div>
  )
}

interface InsertPointProps {
  onInsert: (type: 'sql' | 'markdown') => void
}

function InsertPoint({ onInsert }: InsertPointProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-0.5 transition-all duration-150',
        isHovered ? 'opacity-100' : 'opacity-0 hover:opacity-100'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex-1 h-px bg-border/40" />
      <div className="flex gap-1">
        <button
          onClick={() => onInsert('sql')}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors font-mono"
        >
          + SQL
        </button>
        <button
          onClick={() => onInsert('markdown')}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors font-mono"
        >
          + Note
        </button>
      </div>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  )
}
