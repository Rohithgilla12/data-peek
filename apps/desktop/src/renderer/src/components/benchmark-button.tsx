import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Timer, Loader2, ChevronDown, Gauge } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface BenchmarkButtonProps {
  onBenchmark: (runCount: number) => void
  isRunning: boolean
  disabled?: boolean
}

/**
 * Predefined run count options for benchmarking
 */
const RUN_OPTIONS = [
  { count: 10, label: '10 runs', description: 'Quick test' },
  { count: 50, label: '50 runs', description: 'Standard benchmark' },
  { count: 100, label: '100 runs', description: 'Detailed analysis' },
  { count: 500, label: '500 runs', description: 'Statistical precision' }
]

export function BenchmarkButton({ onBenchmark, isRunning, disabled }: BenchmarkButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'gap-1.5 h-7 px-2.5',
                  'transition-all duration-200',
                  isRunning && 'text-amber-500 bg-amber-500/10'
                )}
                disabled={isRunning || disabled}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="text-xs font-medium">Running...</span>
                  </>
                ) : (
                  <>
                    <Gauge className="size-3.5" />
                    <span className="text-xs font-medium">Benchmark</span>
                    <ChevronDown className="size-3 ml-0.5 opacity-60" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={cn(
                'min-w-[180px]',
                'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
                'duration-200'
              )}
            >
              <div className="px-2 py-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="size-3.5" />
                  <span className="font-medium">Run iterations</span>
                </div>
              </div>
              <DropdownMenuSeparator />
              {RUN_OPTIONS.map(({ count, label, description }) => (
                <DropdownMenuItem
                  key={count}
                  onClick={() => onBenchmark(count)}
                  className={cn(
                    'flex items-center justify-between gap-4 cursor-pointer',
                    'focus:bg-primary/10 focus:text-primary'
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{description}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {count >= 100 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {count >= 500 ? 'PRECISE' : 'DETAILED'}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className={cn(
            'max-w-[220px] p-3',
            'bg-popover/95 backdrop-blur-sm',
            'border border-border/60'
          )}
        >
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Performance Benchmark</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Run the query multiple times to collect timing statistics including average, p90, p95,
              and p99 latencies.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
