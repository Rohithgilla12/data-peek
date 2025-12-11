import { useCallback } from 'react'
import { X, Square, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TitlebarActions() {
  const handleMinimize = useCallback(() => {
    window.api.window.minimize()
  }, [])

  const handleMaximize = useCallback(() => {
    window.api.window.maximize()
  }, [])

  const handleClose = useCallback(() => {
    window.api.window.close()
  }, [])

  return (
    <div className="titlebar-no-drag flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-14 w-9.5 text-muted-foreground rounded-none"
        onClick={handleMinimize}
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-14 w-9.5 text-muted-foreground rounded-none"
        onClick={handleMaximize}
      >
        <Square className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-14 w-9.5 text-muted-foreground rounded-none hover:bg-red-500!"
        onClick={handleClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
