'use client'

import { Pencil, Save, X, Plus, Trash2 } from 'lucide-react'
import { Button, Badge } from '@data-peek/ui'
import { useEditStore } from '@/stores/edit-store'
import { useQueryStore } from '@/stores/query-store'

interface EditToolbarProps {
  tabId: string
  onSave: () => void
  onAddRow: () => void
  isSaving: boolean
}

export function EditToolbar({ tabId, onSave, onAddRow, isSaving }: EditToolbarProps) {
  const { isInEditMode, enterEditMode, exitEditMode, revertAllChanges, hasPendingChanges, getPendingChangesCount } =
    useEditStore()

  const isEditing = isInEditMode(tabId)
  const hasChanges = hasPendingChanges(tabId)
  const counts = getPendingChangesCount(tabId)
  const totalChanges = counts.updates + counts.inserts + counts.deletes

  if (!isEditing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          enterEditMode(tabId, {
            schema: '',
            table: '',
            primaryKeyColumns: [],
            columns: [],
          })
        }}
        className="gap-1.5 text-muted-foreground"
        title="Enter edit mode"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-accent/20 bg-accent/5 shrink-0">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/30 text-accent">
        EDIT MODE
      </Badge>

      <Button
        variant="ghost"
        size="sm"
        onClick={onAddRow}
        className="gap-1 text-xs text-muted-foreground"
        title="Add new row (⌘⇧A)"
      >
        <Plus className="h-3 w-3" />
        Add Row
      </Button>

      <div className="flex-1" />

      {hasChanges && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {counts.updates > 0 && `${counts.updates} update${counts.updates > 1 ? 's' : ''}`}
          {counts.updates > 0 && (counts.inserts > 0 || counts.deletes > 0) && ', '}
          {counts.inserts > 0 && `${counts.inserts} insert${counts.inserts > 1 ? 's' : ''}`}
          {counts.inserts > 0 && counts.deletes > 0 && ', '}
          {counts.deletes > 0 && `${counts.deletes} delete${counts.deletes > 1 ? 's' : ''}`}
        </span>
      )}

      <Button
        size="sm"
        onClick={onSave}
        disabled={!hasChanges || isSaving}
        className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90 text-xs"
      >
        <Save className="h-3 w-3" />
        Save {totalChanges > 0 && `(${totalChanges})`}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => revertAllChanges(tabId)}
        disabled={!hasChanges}
        className="gap-1 text-xs text-muted-foreground"
      >
        <X className="h-3 w-3" />
        Discard
      </Button>

      <div className="h-4 w-px bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          revertAllChanges(tabId)
          exitEditMode(tabId)
        }}
        className="gap-1 text-xs text-muted-foreground"
      >
        Exit Edit
      </Button>
    </div>
  )
}
