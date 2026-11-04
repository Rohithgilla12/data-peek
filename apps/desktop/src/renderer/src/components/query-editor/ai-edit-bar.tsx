import { useEffect, useRef, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type { editor, IRange } from 'monaco-editor'
import { Check, Sparkles, Square, X } from 'lucide-react'
import type { ConnectionConfig, SchemaInfo } from '@shared/index'
import { Button, cn } from '@data-peek/ui'
import { useTheme } from '@/components/theme-provider'
import { editRequest } from '@/lib/ai-edit'
import { formatSQL, formatterLanguage } from '@/lib/sql-formatter'

interface Target {
  original: string
  whole: string
  partial: boolean
  /** Follows the target text as the user keeps typing elsewhere in the query. */
  tracked: editor.IEditorDecorationsCollection
}

type Phase =
  | { status: 'prompt'; error?: string }
  | { status: 'thinking'; requestId: string; activity?: string }
  | { status: 'review'; proposed: string; note: string }

function snapshot(ed: editor.IStandaloneCodeEditor): Target | null {
  const model = ed.getModel()
  if (!model) return null
  const selection = ed.getSelection()
  const partial = !!selection && !selection.isEmpty()
  const range: IRange = partial ? selection : model.getFullModelRange()
  return {
    original: model.getValueInRange(range),
    whole: model.getValue(),
    partial,
    tracked: ed.createDecorationsCollection([
      // 1 = NeverGrowsWhenTypingAtEdges: typing next to the range stays outside it.
      { range, options: { stickiness: 1 } }
    ])
  }
}

interface AiEditBarProps {
  editor: editor.IStandaloneCodeEditor
  connection: ConnectionConfig
  schemas: SchemaInfo[]
  /** Sent as soon as the bar opens, e.g. "Fix this error: …". */
  initialInstruction?: string
  onClose: () => void
}

const isMac = window.electron.process.platform === 'darwin'

/**
 * The wrapper disposes its models before detaching them, and Monaco throws.
 * This component's cleanup runs before the wrapper's, so it can detach and
 * dispose the models in the right order whenever the diff goes away.
 */
function ReviewDiff({
  original,
  proposed,
  dark
}: {
  original: string
  proposed: string
  dark: boolean
}) {
  const diff = useRef<editor.IStandaloneDiffEditor | null>(null)
  useEffect(
    () => () => {
      const models = diff.current?.getModel()
      diff.current?.setModel(null)
      models?.original.dispose()
      models?.modified.dispose()
    },
    []
  )
  const lines = Math.max(original.split('\n').length, proposed.split('\n').length)
  return (
    <DiffEditor
      height={Math.min(260, 40 + 19 * lines)}
      language="sql"
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      onMount={(d) => (diff.current = d)}
      original={original}
      modified={proposed}
      theme={dark ? 'data-peek-dark' : 'data-peek-light'}
      options={{
        readOnly: true,
        renderSideBySide: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'off',
        fontSize: 12,
        renderOverviewRuler: false,
        folding: false
      }}
    />
  )
}

/**
 * ⌘I in the SQL editor: describe a change, review it as a diff, accept or
 * reject. Accepting is one ordinary edit, so ⌘Z takes it back.
 */
export function AiEditBar({
  editor: ed,
  connection,
  schemas,
  initialInstruction,
  onClose
}: AiEditBarProps) {
  const { theme } = useTheme()
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [partial] = useState(() => !(ed.getSelection()?.isEmpty() ?? true))
  const target = useRef<Target | null>(null)
  const inFlight = useRef<string | null>(null)
  const [instruction, setInstruction] = useState(initialInstruction ?? '')
  const [phase, setPhase] = useState<Phase>({ status: 'prompt' })
  const reviewRef = useRef<HTMLDivElement>(null)
  const live = useRef(true)

  const pendingCleanup = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    live.current = true
    clearTimeout(pendingCleanup.current)
    return () => {
      live.current = false
      // Unmounting (tab switch, editor collapse) must not leave the CLI
      // running. Deferred a tick so React's dev-only remount doesn't kill the
      // request it is about to keep using.
      pendingCleanup.current = setTimeout(() => {
        if (inFlight.current) void window.api.ai.cancelChatStream(inFlight.current)
        target.current?.tracked.clear()
      }, 0)
    }
  }, [])

  const sentInitial = useRef(false)
  useEffect(() => {
    if (!initialInstruction || sentInitial.current) return
    sentInitial.current = true
    void submit(initialInstruction)
    // Runs once on open; submit reads only refs and the instruction passed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase.status === 'review') reviewRef.current?.focus()
  }, [phase.status])

  const close = (): void => {
    if (phase.status === 'thinking') void window.api.ai.cancelChatStream(phase.requestId)
    onClose()
    ed.focus()
  }

  const submit = async (text = instruction): Promise<void> => {
    if (!text.trim()) return
    target.current?.tracked.clear()
    const t = snapshot(ed)
    target.current = t
    if (!t) return
    const requestId = crypto.randomUUID()
    inFlight.current = requestId
    setPhase({ status: 'thinking', requestId })
    const response = await window.api.ai.chatStream(
      editRequest(text, t.original, t.partial ? t.whole : undefined),
      schemas,
      connection.dbType || 'postgresql',
      connection.id,
      undefined,
      (event) => {
        if (event.type === 'activity' && live.current) {
          setPhase((p) => (p.status === 'thinking' ? { ...p, activity: event.label } : p))
        }
      },
      requestId
    )
    inFlight.current = null
    if (!live.current) return
    const sql = response.success ? response.data?.sql : null
    if (!sql) {
      setPhase({
        status: 'prompt',
        error: response.success
          ? (response.data?.message ?? 'No SQL came back.')
          : (response.error ?? 'No SQL came back.')
      })
      return
    }
    const proposed =
      sql.includes('\n') || t.partial
        ? sql
        : formatSQL(sql, {
            language: formatterLanguage(connection.dbType),
            keywordCase: 'preserve'
          })
    setPhase({ status: 'review', proposed, note: response.data?.message ?? '' })
  }

  const accept = (): void => {
    const t = target.current
    if (phase.status !== 'review' || !t) return
    const range = t.tracked.getRange(0)
    if (!range || ed.getModel()?.getValueInRange(range) !== t.original) {
      setPhase({
        status: 'prompt',
        error:
          'The query changed while this was being written, so nothing was applied. Press Enter to try again.'
      })
      return
    }
    ed.pushUndoStop()
    ed.executeEdits('ai-edit', [{ range, text: phase.proposed }])
    ed.pushUndoStop()
    onClose()
    ed.focus()
  }

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-primary/40 bg-card">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Sparkles className="size-3.5 shrink-0 text-primary" />
        {phase.status === 'thinking' ? (
          <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {phase.activity ?? 'Rewriting'}: {instruction}
          </div>
        ) : phase.status === 'review' ? (
          <p className="flex-1 truncate font-sans text-xs text-foreground/85" title={phase.note}>
            {phase.note || instruction}
          </p>
        ) : (
          <input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') close()
            }}
            placeholder={
              partial
                ? 'Change the selection: "join the owner\'s email"'
                : 'Change this query: "only paid invoices from last month"'
            }
            aria-label="Describe the change"
            className="flex-1 bg-transparent font-sans text-[13px] outline-none placeholder:text-muted-foreground/50"
          />
        )}
        {phase.status === 'thinking' ? (
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Square className="size-2.5" /> Stop
          </button>
        ) : (
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      {phase.status === 'prompt' && phase.error && (
        <p className="border-t border-border/50 px-3 py-1.5 text-xs text-destructive">
          {phase.error}
        </p>
      )}
      {phase.status === 'review' && (
        <div
          ref={reviewRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              accept()
            }
          }}
          className="border-t border-border/50 outline-none"
        >
          <ReviewDiff
            original={target.current?.original ?? ''}
            proposed={phase.proposed}
            dark={dark}
          />
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-2.5 py-1.5">
            <span className={cn('mr-auto text-[11px] text-muted-foreground/70')}>
              {isMac ? '⌘Z' : 'Ctrl+Z'} undoes it after you accept
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={close}>
              Reject <kbd className="ml-1 opacity-60">esc</kbd>
            </Button>
            <Button size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={accept}>
              <Check className="size-3" /> Accept <kbd className="ml-1 opacity-60">↵</kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
