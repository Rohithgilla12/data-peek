import * as React from 'react'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import { Button, cn } from '@data-peek/ui'
import { CaretDownIcon, CaretUpIcon, CloseIcon, SearchIcon } from '@/components/icons'

export interface FindOptions {
  caseSensitive: boolean
  regex: boolean
}

export interface CellFindBarProps {
  /** Controlled open state. If omitted, the find bar manages its own open state via Mod+F / Esc. */
  open?: boolean
  /** Called when the find bar is closed (via Esc or Close button). */
  onClose?: () => void
  /** Called when open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Called to advance to the next match. */
  onFindNext?: (needle: string, options: FindOptions) => void
  /** Called to jump to the previous match. */
  onFindPrev?: (needle: string, options: FindOptions) => void
  /** Called when search needle or search options change. */
  onSearchChange?: (needle: string, options: FindOptions) => void
  /** Total count of matching cells. */
  matchCount?: number
  /** Currently active match index (0-based). */
  currentMatchIndex?: number
  /** Controlled search needle. */
  needle?: string
  /** Callback when search needle changes. */
  onNeedleChange?: (needle: string) => void
  /** Controlled case-sensitivity flag. */
  caseSensitive?: boolean
  /** Callback when case-sensitivity changes. */
  onCaseSensitiveChange?: (caseSensitive: boolean) => void
  /** Controlled regex flag. */
  regex?: boolean
  /** Callback when regex flag changes. */
  onRegexChange?: (regex: boolean) => void
  /** Optional target container ref to scope keyboard shortcuts. */
  target?: React.RefObject<HTMLElement | null>
  className?: string
}

export function CellFindBar({
  open: controlledOpen,
  onClose,
  onOpenChange,
  onFindNext,
  onFindPrev,
  onSearchChange,
  matchCount,
  currentMatchIndex,
  needle: controlledNeedle,
  onNeedleChange,
  caseSensitive: controlledCaseSensitive,
  onCaseSensitiveChange,
  regex: controlledRegex,
  onRegexChange,
  target,
  className
}: CellFindBarProps): React.JSX.Element | null {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen

  const [uncontrolledNeedle, setUncontrolledNeedle] = React.useState('')
  const needle = controlledNeedle !== undefined ? controlledNeedle : uncontrolledNeedle

  const [uncontrolledCaseSensitive, setUncontrolledCaseSensitive] = React.useState(false)
  const caseSensitive =
    controlledCaseSensitive !== undefined ? controlledCaseSensitive : uncontrolledCaseSensitive

  const [uncontrolledRegex, setUncontrolledRegex] = React.useState(false)
  const regex = controlledRegex !== undefined ? controlledRegex : uncontrolledRegex

  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [controlledOpen, onOpenChange]
  )

  const handleClose = React.useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [setOpen, onClose])

  const handleNeedleChange = React.useCallback(
    (val: string) => {
      if (controlledNeedle === undefined) {
        setUncontrolledNeedle(val)
      }
      onNeedleChange?.(val)
      onSearchChange?.(val, { caseSensitive, regex })
    },
    [controlledNeedle, onNeedleChange, onSearchChange, caseSensitive, regex]
  )

  const handleToggleCase = React.useCallback(() => {
    const nextVal = !caseSensitive
    if (controlledCaseSensitive === undefined) {
      setUncontrolledCaseSensitive(nextVal)
    }
    onCaseSensitiveChange?.(nextVal)
    onSearchChange?.(needle, { caseSensitive: nextVal, regex })
  }, [caseSensitive, controlledCaseSensitive, onCaseSensitiveChange, onSearchChange, needle, regex])

  const handleToggleRegex = React.useCallback(() => {
    const nextVal = !regex
    if (controlledRegex === undefined) {
      setUncontrolledRegex(nextVal)
    }
    onRegexChange?.(nextVal)
    onSearchChange?.(needle, { caseSensitive, regex: nextVal })
  }, [regex, controlledRegex, onRegexChange, onSearchChange, needle, caseSensitive])

  const handleFindNext = React.useCallback(() => {
    if (!needle) return
    onFindNext?.(needle, { caseSensitive, regex })
  }, [needle, caseSensitive, regex, onFindNext])

  const handleFindPrev = React.useCallback(() => {
    if (!needle) return
    onFindPrev?.(needle, { caseSensitive, regex })
  }, [needle, caseSensitive, regex, onFindPrev])

  // Focus input whenever find bar opens
  React.useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isOpen])

  // Global hotkeys for Mod+F, Mod+G, Shift+Mod+G
  const hotkeys = React.useMemo<UseHotkeyDefinition[]>(() => {
    return [
      {
        hotkey: 'Mod+F',
        callback: (e) => {
          e?.preventDefault()
          setOpen(true)
          inputRef.current?.focus()
          inputRef.current?.select()
        },
        options: {
          enabled: true,
          preventDefault: true,
          target,
          ignoreInputs: false
        }
      },
      {
        hotkey: 'Mod+G',
        callback: (e) => {
          e?.preventDefault()
          if (isOpen) {
            handleFindNext()
          }
        },
        options: {
          enabled: isOpen,
          preventDefault: true,
          target,
          ignoreInputs: false
        }
      },
      {
        hotkey: 'Mod+Shift+G',
        callback: (e) => {
          e?.preventDefault()
          if (isOpen) {
            handleFindPrev()
          }
        },
        options: {
          enabled: isOpen,
          preventDefault: true,
          target,
          ignoreInputs: false
        }
      }
    ]
  }, [isOpen, setOpen, target, handleFindNext, handleFindPrev])

  useHotkeys(hotkeys)

  if (!isOpen) {
    return null
  }

  const hasNeedle = needle.length > 0
  const totalMatches = matchCount ?? 0
  const activeMatchNum =
    totalMatches > 0 && currentMatchIndex !== undefined ? currentMatchIndex + 1 : 1

  return (
    <div
      role="search"
      aria-label="Find in grid"
      data-testid="cell-find-bar"
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 bg-background/95 backdrop-blur-sm border border-border shadow-sm rounded-md text-xs select-none',
        className
      )}
    >
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={needle}
          onChange={(e) => handleNeedleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) {
                handleFindPrev()
              } else {
                handleFindNext()
              }
            } else if (e.key === 'Escape') {
              e.preventDefault()
              handleClose()
            }
          }}
          placeholder="Find..."
          aria-label="Find in grid"
          className="h-7 w-44 pl-7 pr-2 text-xs bg-muted/50 hover:bg-muted/70 focus:bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring font-mono placeholder:font-sans placeholder:text-muted-foreground transition-colors"
        />
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleCase}
          aria-pressed={caseSensitive}
          aria-label="Match Case"
          title="Match Case (Alt+C)"
          className={cn(
            'h-6 px-1.5 text-2xs font-mono font-medium rounded transition-colors',
            caseSensitive
              ? 'bg-primary/15 text-primary hover:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          Aa
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleRegex}
          aria-pressed={regex}
          aria-label="Use Regular Expression"
          title="Use Regular Expression (Alt+R)"
          className={cn(
            'h-6 px-1.5 text-2xs font-mono font-medium rounded transition-colors',
            regex
              ? 'bg-primary/15 text-primary hover:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          .*
        </Button>
      </div>

      <div className="flex items-center min-w-[70px] px-1 text-2xs font-mono tabular-nums text-muted-foreground">
        {hasNeedle ? (
          totalMatches === 0 ? (
            <span className="text-destructive font-medium">No matches</span>
          ) : (
            <span>
              {activeMatchNum} of {totalMatches} matches
            </span>
          )
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleFindPrev}
          disabled={!hasNeedle || totalMatches === 0}
          aria-label="Previous Match"
          title="Previous Match (Shift+Enter)"
          className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <CaretUpIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleFindNext}
          disabled={!hasNeedle || totalMatches === 0}
          aria-label="Next Match"
          title="Next Match (Enter)"
          className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <CaretDownIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClose}
          aria-label="Close find bar"
          title="Close (Escape)"
          className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CloseIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
