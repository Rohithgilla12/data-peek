'use client'

import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/stores/settings-store'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const {
    hideQueryEditorByDefault,
    expandJsonByDefault,
    setHideQueryEditorByDefault,
    setExpandJsonByDefault,
    resetSettings
  } = useSettingsStore()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            Settings
          </DialogTitle>
          <DialogDescription>Configure your data-peek preferences.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Query Editor Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Query Editor
            </h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="hide-editor">Hide query editor by default</Label>
                <p className="text-xs text-muted-foreground">
                  Start with the query editor collapsed
                </p>
              </div>
              <Switch
                id="hide-editor"
                checked={hideQueryEditorByDefault}
                onCheckedChange={setHideQueryEditorByDefault}
              />
            </div>
          </div>

          {/* JSON Display Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              JSON Display
            </h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="expand-json">Expand JSON by default</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically expand all JSON objects when viewing
                </p>
              </div>
              <Switch
                id="expand-json"
                checked={expandJsonByDefault}
                onCheckedChange={setExpandJsonByDefault}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={resetSettings}>
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
