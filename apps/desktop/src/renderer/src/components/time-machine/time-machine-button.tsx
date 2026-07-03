import { History } from 'lucide-react'
import {
  Badge,
  Button,
  keys,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@data-peek/ui'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { useSettingsStore } from '@/stores/settings-store'

interface TimeMachineButtonProps {
  tabId: string
  disabled?: boolean
}

export function TimeMachineButton({ tabId, disabled }: TimeMachineButtonProps) {
  const state = useTimeMachineStore((s) => s.states[tabId])
  const enabled = useSettingsStore((s) => s.timeMachineEnabled)
  const openStrip = useTimeMachineStore((s) => s.openStrip)
  const closeStrip = useTimeMachineStore((s) => s.closeStrip)

  if (!enabled) return null

  const isOpen = !!state?.open
  const runCount = state?.runs.length ?? 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isOpen ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5 h-7"
            disabled={disabled}
            onClick={() => (isOpen ? closeStrip(tabId) : openStrip(tabId))}
          >
            <History className="size-3.5" />
            Time Machine
            {isOpen && runCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                {runCount}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {isOpen ? 'Hide' : 'Show'} run history timeline ({keys.mod}
            {keys.shift}H)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
