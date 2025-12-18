import { useState, useEffect, useRef } from 'react'
import { X, Download, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useDashboardStore } from '@/stores'
import type { Dashboard, CreateDashboardInput } from '@shared/index'

interface DashboardFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingDashboard: Dashboard | null
}

/**
 * Render a modal dialog for creating or editing a dashboard.
 *
 * The dialog manages form state for name, description, and tags; initializes fields when
 * editing an existing dashboard; supports adding/removing tags and Enter-to-add behavior;
 * and provides import/export (JSON) and submit flows that call the dashboard store actions.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked with the new open state to close or open the dialog
 * @param editingDashboard - If provided, the dashboard being edited; when `null` the dialog operates in create mode
 * @returns The dashboard form dialog React element
 */
export function DashboardFormDialog({
  open,
  onOpenChange,
  editingDashboard
}: DashboardFormDialogProps) {
  const createDashboard = useDashboardStore((s) => s.createDashboard)
  const updateDashboard = useDashboardStore((s) => s.updateDashboard)
  const exportDashboard = useDashboardStore((s) => s.exportDashboard)
  const importDashboard = useDashboardStore((s) => s.importDashboard)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = editingDashboard !== null

  const handleExport = () => {
    if (!editingDashboard) return

    const jsonData = exportDashboard(editingDashboard.id)
    if (!jsonData) return

    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editingDashboard.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-dashboard.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const jsonData = event.target?.result as string
      const result = await importDashboard(jsonData)
      if (result) {
        onOpenChange(false)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  useEffect(() => {
    if (open) {
      if (editingDashboard) {
        setName(editingDashboard.name)
        setDescription(editingDashboard.description || '')
        setTags(editingDashboard.tags)
      } else {
        setName('')
        setDescription('')
        setTags([])
      }
      setTagInput('')
    }
  }, [open, editingDashboard])

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return

    setIsSubmitting(true)

    try {
      if (isEditing && editingDashboard) {
        await updateDashboard(editingDashboard.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          tags
        })
      } else {
        const input: CreateDashboardInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          tags,
          widgets: [],
          layoutCols: 12
        }
        await createDashboard(input)
      }

      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Dashboard' : 'Create Dashboard'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the dashboard details.'
              : 'Create a new dashboard to visualize your data.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="What insights does this dashboard show?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tags">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {isEditing && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Export & Import</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="flex-1">
                    <Download className="size-4 mr-2" />
                    Export Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportClick}
                    className="flex-1"
                  >
                    <Upload className="size-4 mr-2" />
                    Import Dashboard
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Export saves the dashboard configuration as JSON. Import creates a new dashboard
                  from a JSON file.
                </p>
              </div>
            </>
          )}

          {!isEditing && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Import from File</Label>
                <Button variant="outline" size="sm" onClick={handleImportClick}>
                  <Upload className="size-4 mr-2" />
                  Import Dashboard JSON
                </Button>
                <p className="text-xs text-muted-foreground">
                  Import a previously exported dashboard configuration.
                </p>
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Dashboard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
