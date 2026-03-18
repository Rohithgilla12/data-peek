import * as React from 'react'
import { Eye, EyeOff, Lock, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useMaskingStore } from '@/stores/masking-store'

const EMPTY_ARRAY: string[] = []

interface MaskingToolbarProps {
  tabId: string
}

export function MaskingToolbar({ tabId }: MaskingToolbarProps) {
  const maskedColumnsArray = useMaskingStore((s) => s.maskedColumns[tabId] ?? EMPTY_ARRAY)
  const autoMaskRules = useMaskingStore((s) => s.autoMaskRules)
  const hoverToPeek = useMaskingStore((s) => s.hoverToPeek)
  const autoMaskEnabled = useMaskingStore((s) => s.autoMaskEnabled)
  const unmaskAll = useMaskingStore((s) => s.unmaskAll)
  const updateAutoMaskRule = useMaskingStore((s) => s.updateAutoMaskRule)
  const addAutoMaskRule = useMaskingStore((s) => s.addAutoMaskRule)
  const removeAutoMaskRule = useMaskingStore((s) => s.removeAutoMaskRule)
  const setHoverToPeek = useMaskingStore((s) => s.setHoverToPeek)
  const setAutoMaskEnabled = useMaskingStore((s) => s.setAutoMaskEnabled)

  const [newPattern, setNewPattern] = React.useState('')
  const maskedCount = maskedColumnsArray.length

  const handleAddRule = () => {
    const trimmed = newPattern.trim()
    if (!trimmed) return
    addAutoMaskRule(trimmed)
    setNewPattern('')
  }

  return (
    <div className="flex items-center gap-1.5">
      {maskedCount > 0 && (
        <div className="flex items-center gap-1">
          <Badge
            variant="secondary"
            className="gap-1 px-1.5 py-0 text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20"
          >
            <Lock className="size-2.5" />
            {maskedCount} masked
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 text-muted-foreground hover:text-foreground"
            title="Unmask all columns"
            onClick={() => unmaskAll(tabId)}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
            {autoMaskEnabled ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            Masking
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-xs font-medium">Data Masking</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Auto-mask sensitive columns</span>
            <Switch
              checked={autoMaskEnabled}
              onCheckedChange={setAutoMaskEnabled}
              className="scale-75"
            />
          </div>

          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Hover with Alt to peek</span>
            <Switch checked={hoverToPeek} onCheckedChange={setHoverToPeek} className="scale-75" />
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Auto-mask rules
          </DropdownMenuLabel>

          {autoMaskRules.map((rule) => (
            <div key={rule.id} className="px-2 py-1 flex items-center gap-2">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => updateAutoMaskRule(rule.id, { enabled: checked })}
                className="scale-75 shrink-0"
              />
              <span className="text-xs font-mono flex-1 truncate text-muted-foreground">
                {rule.pattern}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 text-muted-foreground hover:text-red-500"
                onClick={() => removeAutoMaskRule(rule.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}

          <DropdownMenuSeparator />

          <div className="px-2 py-1.5 flex items-center gap-1.5">
            <Input
              placeholder="Add pattern (regex)..."
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRule()
              }}
              className="h-7 text-xs flex-1"
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              variant="secondary"
              size="icon"
              className="size-7 shrink-0"
              onClick={handleAddRule}
              disabled={!newPattern.trim()}
            >
              <Plus className="size-3" />
            </Button>
          </div>

          {maskedCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => unmaskAll(tabId)}
                className="text-xs text-muted-foreground"
              >
                <X className="size-3 mr-2" />
                Unmask all for this tab
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
