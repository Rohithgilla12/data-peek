import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import {
  Button,
  Switch,
  Label,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@data-peek/ui'
import type { TimeMachineStats } from '@data-peek/shared'

import { useSettingsStore } from '@/stores/settings-store'
import { McpSettingsSection } from '@/components/mcp-settings-section'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const {
    hideQueryEditorByDefault,
    expandJsonByDefault,
    jsonExpandDepth,
    hideQuickQueryPanel,
    queryTimeoutMs,
    pokemonBuddyEnabled,
    timeMachineEnabled,
    setHideQueryEditorByDefault,
    setExpandJsonByDefault,
    setJsonExpandDepth,
    setHideQuickQueryPanel,
    setQueryTimeoutMs,
    setPokemonBuddyEnabled,
    setTimeMachineEnabled,
    resetSettings
  } = useSettingsStore()

  const [tmStats, setTmStats] = useState<TimeMachineStats | null>(null)
  const [tmWipeArmed, setTmWipeArmed] = useState(false)

  useEffect(() => {
    if (!open) {
      setTmWipeArmed(false)
      return
    }
    let cancelled = false
    window.api.timeMachine
      .stats()
      .then((response) => {
        if (!cancelled && response.success && response.data) setTmStats(response.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const handleWipeTimeMachine = async () => {
    if (!tmWipeArmed) {
      setTmWipeArmed(true)
      return
    }
    setTmWipeArmed(false)
    try {
      await window.api.timeMachine.clearAll()
      const response = await window.api.timeMachine.stats()
      if (response.success && response.data) setTmStats(response.data)
    } catch {
      // Storage unavailable — nothing to wipe.
    }
  }

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

        <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto pr-2">
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
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="json-depth">Default JSON expansion depth</Label>
                <p className="text-xs text-muted-foreground">
                  How many levels deep JSON should be expanded
                </p>
              </div>
              <Input
                id="json-depth"
                type="number"
                min={1}
                max={10}
                className="w-24"
                value={jsonExpandDepth}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  if (!isNaN(val)) setJsonExpandDepth(val)
                }}
              />
            </div>
          </div>

          {/* Fun Features Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Fun Features
            </h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="pokemon-buddy">Pokemon Buddy</Label>
                <p className="text-xs text-muted-foreground">
                  Show a friendly Pokemon buddy in the sidebar
                </p>
              </div>
              <Switch
                id="pokemon-buddy"
                checked={pokemonBuddyEnabled}
                onCheckedChange={setPokemonBuddyEnabled}
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

          <McpSettingsSection />

          {/* Time Machine Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Time Machine
            </h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="time-machine">Snapshot query results</Label>
                <p className="text-xs text-muted-foreground">
                  Keep a local history of SELECT results to scrub and diff. Masked columns are
                  stored redacted.
                </p>
              </div>
              <Switch
                id="time-machine"
                checked={timeMachineEnabled}
                onCheckedChange={setTimeMachineEnabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {tmStats
                  ? `${tmStats.runCount} runs across ${tmStats.queryCount} queries · ${formatBytes(tmStats.totalBytes)} on disk`
                  : 'No snapshot storage in use'}
              </p>
              <Button
                variant={tmWipeArmed ? 'destructive' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                disabled={!tmStats || tmStats.runCount === 0}
                onClick={handleWipeTimeMachine}
              >
                {tmWipeArmed ? 'Click again to confirm' : 'Delete all snapshots'}
              </Button>
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
