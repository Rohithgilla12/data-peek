import { useCallback } from 'react'
import { CloseIcon, MinusIcon, SquareIcon } from '@/components/icons'
import { Button } from '@data-peek/ui'

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
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-14 w-9.5 text-muted-foreground rounded-none"
        onClick={handleMaximize}
      >
        <SquareIcon className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-14 w-9.5 text-muted-foreground rounded-none hover:bg-red-500!"
        onClick={handleClose}
      >
        <CloseIcon className="size-4" />
      </Button>
    </div>
  )
}
