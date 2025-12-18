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
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/stores/settings-store'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const {
    hideQueryEditorByDefault,
    expandJsonByDefault,
    hideQuickQueryPanel,
    queryTimeoutMs,
    setHideQueryEditorByDefault,
    setExpandJsonByDefault,
    setHideQuickQueryPanel,
    setQueryTimeoutMs,
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

          {/* Quick Query Panel */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Quick Query Panel
            </h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="hide-quick-query-panel">Hide quick query panel by default</Label>
                <p className="text-xs text-muted-foreground">
                  Hide the quick query panel by default
                </p>
              </div>
              <Switch
                id="hide-quick-query-panel"
                checked={hideQuickQueryPanel}
                onCheckedChange={setHideQuickQueryPanel}
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

          {/* Database Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Database
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="query-timeout">Query timeout (seconds)</Label>
                  <p className="text-xs text-muted-foreground">
                    Maximum time to wait for a query to complete. Set to 0 for no timeout.
                  </p>
                </div>
                <Input
                  id="query-timeout"
                  type="number"
                  min={0}
                  className="w-24"
                  value={queryTimeoutMs === 0 ? '' : queryTimeoutMs / 1000}
                  placeholder="0"
                  onChange={(e) => {
                    const parsed = e.target.value ? parseFloat(e.target.value) : 0
                    const seconds = isNaN(parsed) || parsed < 0 ? 0 : parsed
                    setQueryTimeoutMs(Math.round(seconds * 1000))
                  }}
                />
              </div>
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
