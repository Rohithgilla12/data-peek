import * as React from 'react'
import {
  Pencil,
  PencilOff,
  Plus,
  Save,
  RotateCcw,
  AlertTriangle,
  FileCode,
  ChevronDown,
  PanelRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { cn, keys } from '@/lib/utils'

interface EditToolbarProps {
  isEditMode: boolean
  canEdit: boolean
  noPrimaryKey?: boolean
  pendingChanges: {
    updates: number
    inserts: number
    deletes: number
  }
  isCommitting?: boolean
  onToggleEditMode: () => void
  onAddRow: () => void
  onAddRowWithSheet: () => void
  onSaveChanges: () => void
  onDiscardChanges: () => void
  onPreviewSql: () => void
}

export function EditToolbar({
  isEditMode,
  canEdit,
  noPrimaryKey = false,
  pendingChanges,
  isCommitting = false,
  onToggleEditMode,
  onAddRow,
  onAddRowWithSheet,
  onSaveChanges,
  onDiscardChanges,
  onPreviewSql
}: EditToolbarProps) {
  const [showDiscardDialog, setShowDiscardDialog] = React.useState(false)
  const [showExitDialog, setShowExitDialog] = React.useState(false)

  const totalChanges = pendingChanges.updates + pendingChanges.inserts + pendingChanges.deletes
  const hasChanges = totalChanges > 0

  const handleToggleEditMode = () => {
    if (isEditMode && hasChanges) {
      setShowExitDialog(true)
    } else {
      onToggleEditMode()
    }
  }

  const handleConfirmExit = () => {
    onDiscardChanges()
    onToggleEditMode()
    setShowExitDialog(false)
  }

  const handleDiscardChanges = () => {
    if (hasChanges) {
      setShowDiscardDialog(true)
    }
  }

  const handleConfirmDiscard = () => {
    onDiscardChanges()
    setShowDiscardDialog(false)
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Edit Mode Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-7 gap-1.5 text-xs transition-all',
                isEditMode && 'bg-amber-600 hover:bg-amber-700 text-white'
              )}
              onClick={handleToggleEditMode}
              disabled={!canEdit || noPrimaryKey}
            >
              {isEditMode ? (
                <>
                  <PencilOff className="size-3" />
                  Exit Edit
                </>
              ) : (
                <>
                  <Pencil className="size-3" />
                  Edit
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {noPrimaryKey ? (
              <p className="text-xs text-red-400">Cannot edit: table has no primary key</p>
            ) : !canEdit ? (
              <p className="text-xs">Cannot edit views or query results</p>
            ) : isEditMode ? (
              <p className="text-xs">Exit edit mode</p>
            ) : (
              <p className="text-xs">Enter edit mode to modify data</p>
            )}
          </TooltipContent>
        </Tooltip>

        {/* No Primary Key Warning */}
        {noPrimaryKey && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="size-3.5" />
                <span className="text-xs">No PK</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                This table has no primary key. Editing is disabled because we cannot uniquely
                identify rows for UPDATE/DELETE operations.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Add Row Button - Available in both normal and edit mode */}
        {!isEditMode && canEdit && !noPrimaryKey && (
          <>
            <div className="h-4 w-px bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-green-600 border-green-600/30 hover:bg-green-600/10"
                  onClick={onAddRowWithSheet}
                >
                  <Plus className="size-3" />
                  Add Row
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Add a new row using a form</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Edit Mode Actions */}
        {isEditMode && (
          <>
            <div className="h-4 w-px bg-border mx-1" />

            {/* Add Row Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs text-green-600 border-green-600/30 hover:bg-green-600/10"
                >
                  <Plus className="size-3" />
                  Add Row
                  <ChevronDown className="size-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={onAddRowWithSheet} className="gap-2">
                  <PanelRight className="size-4 text-green-500" />
                  <div className="flex flex-col">
                    <span>Add with Form</span>
                    <span className="text-[10px] text-muted-foreground">
                      Smart fields & validation
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddRow} className="gap-2">
                  <Plus className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>Quick Add</span>
                    <span className="text-[10px] text-muted-foreground">Inline row editing</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pending Changes Badge */}
            {hasChanges && (
              <>
                <div className="h-4 w-px bg-border mx-1" />

                <div className="flex items-center gap-1.5">
                  {pendingChanges.updates > 0 && (
                    <Badge
                      variant="outline"
                      className="text-amber-500 border-amber-500/30 text-[10px] px-1.5"
                    >
                      {pendingChanges.updates} modified
                    </Badge>
                  )}
                  {pendingChanges.inserts > 0 && (
                    <Badge
                      variant="outline"
                      className="text-green-500 border-green-500/30 text-[10px] px-1.5"
                    >
                      {pendingChanges.inserts} new
                    </Badge>
                  )}
                  {pendingChanges.deletes > 0 && (
                    <Badge
                      variant="outline"
                      className="text-red-500 border-red-500/30 text-[10px] px-1.5"
                    >
                      {pendingChanges.deletes} deleted
                    </Badge>
                  )}
                </div>
              </>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Preview SQL */}
            {hasChanges && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={onPreviewSql}
                  >
                    <FileCode className="size-3" />
                    Preview SQL
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Preview the SQL that will be executed</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Discard Changes */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleDiscardChanges}
                  disabled={!hasChanges}
                >
                  <RotateCcw className="size-3" />
                  Discard
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Discard all pending changes ({keys.mod}+{keys.shift}+Z)</p>
              </TooltipContent>
            </Tooltip>

            {/* Save Changes */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                  onClick={onSaveChanges}
                  disabled={!hasChanges || isCommitting}
                >
                  {isCommitting ? (
                    <>
                      <div className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-3" />
                      Save ({totalChanges})
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Save all pending changes to the database ({keys.mod}+S)</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {totalChanges} unsaved change{totalChanges !== 1 ? 's' : ''}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exit Edit Mode Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit Edit Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {totalChanges} unsaved change{totalChanges !== 1 ? 's' : ''}. Exiting edit
              mode will discard all changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit} className="bg-red-600 hover:bg-red-700">
              Exit & Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
