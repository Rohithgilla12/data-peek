import { Bot, MessageSquare } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AgentModeToggleProps {
  isAgentMode: boolean
  onToggle: (enabled: boolean) => void
  disabled?: boolean
}

export function AgentModeToggle({ isAgentMode, onToggle, disabled }: AgentModeToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
            isAgentMode ? 'bg-blue-500/10' : 'bg-muted/50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isAgentMode ? (
            <Bot className="size-3.5 text-blue-400" />
          ) : (
            <MessageSquare className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{isAgentMode ? 'Agent' : 'Chat'}</span>
          <Switch
            checked={isAgentMode}
            onCheckedChange={onToggle}
            disabled={disabled}
            className="scale-75"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px]">
        <p className="font-medium">{isAgentMode ? 'Agent Mode' : 'Chat Mode'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isAgentMode
            ? 'AI executes queries and creates dashboards autonomously'
            : 'AI suggests queries for you to review'}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
