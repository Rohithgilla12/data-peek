import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConnectionStore, useSavedQueryStore } from '@/stores'
import type { SavedQuery } from '@shared/index'
import { Bookmark, FolderPlus, Link2, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface SaveQueryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  editingQuery?: SavedQuery | null
}

export function SaveQueryDialog({ open, onOpenChange, query, editingQuery }: SaveQueryDialogProps) {
  const addSavedQuery = useSavedQueryStore((s) => s.addSavedQuery)
  const updateSavedQuery = useSavedQueryStore((s) => s.updateSavedQuery)
  const getFolders = useSavedQueryStore((s) => s.getFolders)
  const getTags = useSavedQueryStore((s) => s.getTags)

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const activeConnection = useConnectionStore((s) => s.getActiveConnection())

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState<string>('')
  const [newFolder, setNewFolder] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [bindToConnection, setBindToConnection] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Get available folders and tags
  const existingFolders = useMemo(() => getFolders(), [getFolders])
  const existingTags = useMemo(() => getTags(), [getTags])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingQuery) {
        setName(editingQuery.name)
        setDescription(editingQuery.description || '')
        setFolder(editingQuery.folder || '')
        setTags(editingQuery.tags)
        setBindToConnection(!!editingQuery.connectionId)
      } else {
        setName('')
        setDescription('')
        setFolder('')
        setTags([])
        setBindToConnection(false)
      }
      setNewFolder('')
      setNewTag('')
      setIsCreatingFolder(false)
    }
  }, [open, editingQuery])

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleSelectExistingTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag])
    }
  }

  const handleCreateFolder = () => {
    const trimmedFolder = newFolder.trim()
    if (trimmedFolder) {
      setFolder(trimmedFolder)
      setNewFolder('')
      setIsCreatingFolder(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return

    setIsSaving(true)

    try {
      if (editingQuery) {
        await updateSavedQuery(editingQuery.id, {
          name: name.trim(),
          query: query,
          description: description.trim() || undefined,
          folder: folder || undefined,
          tags,
          connectionId: bindToConnection ? activeConnectionId || undefined : undefined
        })
      } else {
        await addSavedQuery({
          name: name.trim(),
          query: query,
          description: description.trim() || undefined,
          folder: folder || undefined,
          tags,
          connectionId: bindToConnection ? activeConnectionId || undefined : undefined
        })
      }
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="size-4" />
            {editingQuery ? 'Edit Saved Query' : 'Save Query'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="query-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="query-name"
              placeholder="e.g., Monthly Sales Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="query-description">Description</Label>
            <Textarea
              id="query-description"
              placeholder="What does this query do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Query Preview */}
          <div className="space-y-2">
            <Label>Query</Label>
            <pre className="text-xs font-mono text-foreground/80 bg-muted/50 rounded-md px-3 py-2 max-h-[80px] overflow-auto whitespace-pre-wrap break-all">
              {query}
            </pre>
          </div>

          {/* Folder */}
          <div className="space-y-2">
            <Label>Folder</Label>
            {isCreatingFolder ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New folder name"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateFolder()
                    }
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false)
                      setNewFolder('')
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsCreatingFolder(false)
                    setNewFolder('')
                  }}
                >
                  <X className="size-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCreateFolder}>
                  Add
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Select
                  value={folder || 'none'}
                  onValueChange={(v) => setFolder(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {existingFolders.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setIsCreatingFolder(true)}>
                  <FolderPlus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-4 hover:bg-transparent"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X className="size-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleAddTag}>
                <Plus className="size-4" />
              </Button>
            </div>
            {existingTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {existingTags
                  .filter((t) => !tags.includes(t))
                  .slice(0, 5)
                  .map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => handleSelectExistingTag(tag)}
                    >
                      + {tag}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          {/* Bind to connection */}
          {activeConnection && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Checkbox
                id="bind-connection"
                checked={bindToConnection}
                onCheckedChange={(checked) => setBindToConnection(checked === true)}
              />
              <Label
                htmlFor="bind-connection"
                className="text-sm font-normal flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="size-3.5" />
                Bind to {activeConnection.name}
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? 'Saving...' : editingQuery ? 'Update' : 'Save Query'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
