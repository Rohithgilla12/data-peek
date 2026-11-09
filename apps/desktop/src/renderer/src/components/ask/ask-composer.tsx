import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { AiIcon, ArrowUpIcon, CaretRightIcon } from '@/components/icons'
import { cn } from '@data-peek/ui'
import { providerNeedsKey } from '@shared/index'
import { classifyInput, type AskMode } from '@/lib/ask-input'
import { useAskProvider } from '@/hooks/use-ask-provider'

export interface AskComposerHandle {
  focus: () => void
  fill: (text: string, mode?: AskMode) => void
}

export interface ComposerEntry {
  text: string
  mode: AskMode
  locked: boolean
}

interface AskComposerProps {
  connectionName: string
  history: ComposerEntry[]
  /** A question is still being answered; SQL can still run meanwhile. */
  thinking: boolean
  onSubmit: (entry: ComposerEntry) => void
}

const isMac = window.electron.process.platform === 'darwin'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-2xs text-muted-foreground">
      {children}
    </kbd>
  )
}

/** Which AI answers, and whether it runs on a subscription or a metered key. */
export function ProviderPill() {
  const { provider, label, isSubscription, detected, activate, openSettings } = useAskProvider()
  if (provider) {
    return (
      <button
        type="button"
        onClick={openSettings}
        title="AI settings"
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span
          className={cn('size-1.5 rounded-full', isSubscription ? 'bg-success' : 'bg-primary')}
        />
        {label}
        <span className="text-muted-foreground/50">
          {isSubscription ? 'your subscription' : providerNeedsKey(provider) ? 'API key' : 'local'}
        </span>
      </button>
    )
  }
  if (detected && detected.length > 0) {
    return (
      <div className="flex items-center gap-1">
        {detected.map((cli) => (
          <button
            key={cli.id}
            type="button"
            onClick={() => void activate(cli.id)}
            className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 text-2xs text-primary transition-colors hover:bg-primary/10"
          >
            <AiIcon className="size-3" /> Use my {cli.label} subscription
          </button>
        ))}
      </div>
    )
  }
  if (detected === null) {
    return (
      <span className="px-1.5 py-0.5 text-2xs text-muted-foreground/60">
        Looking for your AI CLI
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={openSettings}
      className="rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      Connect an AI
    </button>
  )
}

export const AskComposer = forwardRef<AskComposerHandle, AskComposerProps>(function AskComposer(
  { connectionName, history, thinking, onSubmit },
  ref
) {
  const [text, setText] = useState('')
  const [locked, setLocked] = useState<AskMode | null>(null)
  const [recall, setRecall] = useState(-1)
  const area = useRef<HTMLTextAreaElement>(null)
  const { provider } = useAskProvider()
  const mode: AskMode = locked ?? classifyInput(text) ?? 'ask'
  const blocked = mode === 'ask' && (!provider || thinking)

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    fill: (value, nextMode) => {
      setText(value)
      setLocked(nextMode ?? null)
      requestAnimationFrame(() => area.current?.focus())
    }
  }))

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])

  const submit = (): void => {
    if (!text.trim() || blocked) return
    onSubmit({ mode, text, locked: locked !== null })
    setText('')
    setLocked(null)
    setRecall(-1)
  }

  const recallAt = (index: number): void => {
    setRecall(index)
    const entry = index < 0 ? null : history[history.length - 1 - index]
    setText(entry?.text ?? '')
    setLocked(entry?.locked ? entry.mode : null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab' && !e.shiftKey && text.trim()) {
      e.preventDefault()
      setLocked(mode === 'ask' ? 'sql' : 'ask')
    } else if (e.key === 'Escape' && locked) {
      setLocked(null)
    } else if (e.key === 'ArrowUp' && history.length > 0 && !text.includes('\n')) {
      if (text && recall === -1) return
      e.preventDefault()
      recallAt(Math.min(recall + 1, history.length - 1))
    } else if (e.key === 'ArrowDown' && recall >= 0) {
      e.preventDefault()
      recallAt(recall - 1)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'rounded-lg border bg-card shadow-lg shadow-black/20 transition-colors',
          mode === 'sql'
            ? 'border-success/30 focus-within:border-success/60'
            : 'border-border focus-within:border-primary/60'
        )}
      >
        <div className="flex items-start gap-2 px-3 pt-2.5">
          <button
            type="button"
            onClick={() => setLocked(mode === 'ask' ? 'sql' : 'ask')}
            title="Switch between asking and running SQL (Tab)"
            className={cn(
              'mt-px flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-mono text-2xs font-semibold uppercase tracking-wider transition-colors',
              mode === 'sql' ? 'bg-success/10 text-success' : 'bg-primary/15 text-primary'
            )}
          >
            {mode === 'sql' ? <CaretRightIcon className="size-3" /> : <AiIcon className="size-3" />}
            {mode === 'sql' ? 'SQL' : 'Ask'}
            {!locked && text.trim() && <span className="font-normal opacity-50">auto</span>}
          </button>
          <textarea
            ref={area}
            autoFocus
            rows={1}
            value={text}
            spellCheck={mode === 'ask'}
            onChange={(e) => {
              setText(e.target.value)
              setRecall(-1)
            }}
            onKeyDown={onKeyDown}
            placeholder={`Ask about ${connectionName}, or type SQL`}
            aria-label="Ask a question or type SQL"
            className={cn(
              'max-h-60 min-h-[22px] flex-1 resize-none bg-transparent text-sm leading-[22px] text-foreground outline-none placeholder:text-muted-foreground/50',
              mode === 'sql' ? 'font-mono' : 'font-sans'
            )}
          />
        </div>
        <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
          {!provider && <ProviderPill />}
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || blocked}
            aria-label={mode === 'sql' ? 'Run SQL' : 'Ask'}
            className={cn(
              'ml-auto flex size-6 items-center justify-center rounded-md transition-colors disabled:opacity-30',
              mode === 'sql'
                ? 'bg-success/90 text-black hover:bg-success'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            <ArrowUpIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 px-1 text-2xs text-muted-foreground/60">
        {blocked && text.trim() ? (
          <span className="text-warning/80">
            {provider
              ? 'Still answering the last question. SQL runs meanwhile.'
              : 'Connect an AI to ask questions. SQL still runs without one.'}
          </span>
        ) : (
          <>
            <span>
              <Kbd>↵</Kbd> {mode === 'sql' ? 'run' : 'ask'}
            </span>
            <span>
              <Kbd>⇥</Kbd> {mode === 'sql' ? 'ask instead' : 'SQL instead'}
            </span>
            <span>
              <Kbd>↑</Kbd> previous
            </span>
            <span>
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>T</Kbd> new ask
            </span>
          </>
        )}
        <span className="ml-auto">
          AI-written SQL that only reads runs on its own. Writes wait for you.
        </span>
      </div>
    </div>
  )
})
