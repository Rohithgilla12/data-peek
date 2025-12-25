import { useState, useEffect } from 'react'
import { Code2, Info } from 'lucide-react'
import type { Snippet, SnippetCategory } from '@shared/index'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSnippetStore } from '@/stores'

interface CreateSnippetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingSnippet?: Snippet
}

const CATEGORIES: { value: SnippetCategory; label: string }[] = [
  { value: 'select', label: 'SELECT' },
  { value: 'insert', label: 'INSERT' },
  { value: 'update', label: 'UPDATE' },
  { value: 'delete', label: 'DELETE' },
  { value: 'ddl', label: 'DDL' },
  { value: 'aggregate', label: 'Aggregate' },
  { value: 'join', label: 'Join' },
  { value: 'other', label: 'Other' }
]

export function CreateSnippetDialog({
  open,
  onOpenChange,
  editingSnippet
}: CreateSnippetDialogProps) {
  const addSnippet = useSnippetStore((s) => s.addSnippet)
  const updateSnippet = useSnippetStore((s) => s.updateSnippet)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const [category, setCategory] = useState<SnippetCategory>('other')
  const [triggerPrefix, setTriggerPrefix] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditing = !!editingSnippet

  useEffect(() => {
    if (open) {
      if (editingSnippet) {
        setName(editingSnippet.name)
        setDescription(editingSnippet.description)
        setTemplate(editingSnippet.template)
        setCategory(editingSnippet.category)
        setTriggerPrefix(editingSnippet.triggerPrefix || '')
      } else {
        setName('')
        setDescription('')
        setTemplate('')
        setCategory('other')
        setTriggerPrefix('')
      }
    }
  }, [open, editingSnippet])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !template.trim()) return

    setIsSubmitting(true)

    try {
      if (isEditing && editingSnippet) {
        await updateSnippet(editingSnippet.id, {
          name: name.trim(),
          description: description.trim(),
          template: template.trim(),
          category,
          triggerPrefix: triggerPrefix.trim() || undefined
        })
      } else {
        await addSnippet({
          name: name.trim(),
          description: description.trim(),
          template: template.trim(),
          category,
          triggerPrefix: triggerPrefix.trim() || undefined
        })
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save snippet:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Code2 className="size-5" />
            {isEditing ? 'Edit Snippet' : 'Create New Snippet'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2.5">
            <Label htmlFor="name" className="text-sm font-semibold">
              Name
            </Label>
            <Input
              id="name"
              placeholder="e.g., SELECT with JOIN"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              required
            />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="description" className="text-sm font-semibold">
              Description
            </Label>
            <Input
              id="description"
              placeholder="Brief description of what this snippet does"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label htmlFor="category" className="text-sm font-semibold">
                Category
              </Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SnippetCategory)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="trigger" className="text-sm font-semibold">
                  Trigger Prefix
                </Label>
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="top">
                      <p className="text-xs leading-relaxed">
                        Short text to trigger this snippet in the editor autocomplete. E.g.,
                        &quot;sel&quot; for SELECT queries.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="trigger"
                placeholder="e.g., selj"
                value={triggerPrefix}
                onChange={(e) => setTriggerPrefix(e.target.value)}
                className="h-10 font-mono"
                maxLength={10}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="template" className="text-sm font-semibold">
                SQL Template
              </Label>
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md p-3" side="top">
                    <p className="text-xs leading-relaxed mb-2">
                      Use placeholders like ${'{1:table_name}'} for tab stops in the editor.
                    </p>
                    <div className="bg-muted/50 rounded px-2 py-1.5 border border-border/50">
                      <p className="text-[11px] font-mono text-muted-foreground">
                        SELECT * FROM ${'{1:table}'} WHERE ${'{2:column}'} = ${'{3:value}'};
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              id="template"
              placeholder="SELECT * FROM ${1:table_name} WHERE ${2:condition};"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="font-mono text-sm min-h-[160px] leading-relaxed resize-none"
              required
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim() || !template.trim()}
              className="h-10 min-w-[120px]"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Snippet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
