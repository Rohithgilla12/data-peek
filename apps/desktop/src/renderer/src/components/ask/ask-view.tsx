import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import type { SchemaInfo } from '@shared/index'
import { DatabaseIcon } from '@/components/database-icons'
import { useAIStore } from '@/stores/ai-store'
import {
  selectBlocks,
  selectThinking,
  useAskStore,
  type AskContext,
  type AskInput
} from '@/stores/ask-store'
import { useConnectionStore, useTabStore } from '@/stores'
import type { AskMode } from '@/lib/ask-input'
import { AskBlockView } from './ask-block'
import { AskComposer, type AskComposerHandle, type ComposerEntry } from './ask-composer'

const isMac = window.electron.process.platform === 'darwin'

function titleFor(text: string): string {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ')
  return line.length > 32 ? `${line.slice(0, 31)}…` : line
}

interface Starter {
  mode: AskMode
  text: string
}

function startersFor(schemas: SchemaInfo[]): Starter[] {
  const tables = schemas.flatMap((s) =>
    s.tables.filter((t) => t.type === 'table').map((t) => ({ ...t, schema: s.name }))
  )
  if (tables.length === 0) return []
  const qualified = (t: (typeof tables)[number]): string =>
    t.schema === 'public' || t.schema === 'main' ? t.name : `${t.schema}.${t.name}`
  const inbound = new Map<string, number>()
  for (const t of tables) {
    for (const c of t.columns) {
      const ref = c.foreignKey?.referencedTable
      if (ref) inbound.set(ref, (inbound.get(ref) ?? 0) + 1)
    }
  }
  const byImportance = [...tables].sort(
    (a, b) =>
      (inbound.get(b.name) ?? 0) - (inbound.get(a.name) ?? 0) ||
      (b.estimatedRowCount ?? 0) - (a.estimatedRowCount ?? 0)
  )
  const timed = byImportance.find((t) =>
    t.columns.some((c) => /^(created|inserted)_?(at|on|date)$/i.test(c.name))
  )
  const linked = [...tables].sort(
    (a, b) =>
      b.columns.filter((c) => c.foreignKey).length - a.columns.filter((c) => c.foreignKey).length
  )[0]
  const fk = linked?.columns.find((c) => c.foreignKey)?.foreignKey
  const starters: Starter[] = [{ mode: 'ask', text: 'Which tables hold the most data?' }]
  if (timed) starters.push({ mode: 'ask', text: `How many ${timed.name} were added each week?` })
  if (linked && fk) {
    starters.push({ mode: 'ask', text: `How do ${linked.name} relate to ${fk.referencedTable}?` })
  }
  starters.push({ mode: 'sql', text: `select * from ${qualified(byImportance[0])} limit 50` })
  return starters
}

/** With no tabId this is the app's empty state; the first submit opens an Ask tab. */
function ConnectionPrompt() {
  const connections = useConnectionStore((s) => s.connections)
  const selectConnection = useConnectionStore((s) => s.selectConnection)
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-sans text-xl font-semibold tracking-tight">Pick a database</h1>
        <p className="mt-1 font-sans text-[13px] text-muted-foreground">
          {connections.length > 0
            ? 'Then ask it anything, or type SQL.'
            : 'Add a connection from the sidebar to get started.'}
        </p>
        <div className="mt-4 grid gap-1">
          {connections.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectConnection(c.id)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <DatabaseIcon dbType={c.dbType} className="size-4" />
              <span className="flex-1 truncate text-foreground">{c.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {c.host || c.database}
              </span>
              {i < 9 && (
                <kbd className="rounded border border-border/60 px-1 font-mono text-[10px] text-muted-foreground/60">
                  {isMac ? '⌘⇧' : 'Ctrl+Shift+'}
                  {i + 1}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AskView({ tabId }: { tabId: string | null }) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const createAskTab = useTabStore((s) => s.createAskTab)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === (tab?.connectionId ?? s.activeConnectionId))
  )
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const selectConnection = useConnectionStore((s) => s.selectConnection)
  const bindAskTab = useTabStore((s) => s.bindAskTab)
  const renameTab = useTabStore((s) => s.renameTab)
  const schemas = useConnectionStore((s) => s.schemas)
  const schemasLoading = useConnectionStore((s) => s.isLoadingSchema)
  const provider = useAIStore((s) =>
    s.isConfigured ? s.multiProviderConfig?.activeProvider : undefined
  )
  const sessionKey = tabId ?? ''
  const blocks = useAskStore(selectBlocks(sessionKey))
  const thinking = useAskStore(selectThinking(sessionKey))
  const { submit, run, cancel, stop, editSql, remove } = useAskStore.getState()
  const composer = useRef<AskComposerHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // The loaded schema belongs to the active connection, so a tab bound to
  // another one must not ask the AI anything until it is switched back.
  const onActive = connection?.id === activeConnectionId
  const ctx = useMemo<AskContext | null>(
    () => (connection && onActive ? { connection, schemas, provider } : null),
    [connection, onActive, schemas, provider]
  )
  const starters = useMemo(() => startersFor(schemas), [schemas])
  const history = useMemo<ComposerEntry[]>(
    () => blocks.map((b) => ({ text: b.prompt, mode: b.mode, locked: !!b.locked })),
    [blocks]
  )

  const ask = useCallback(
    (input: AskInput) => {
      if (!ctx) return
      pinned.current = true
      const id = tabId ?? createAskTab(ctx.connection.id)
      bindAskTab(id, ctx.connection.id)
      if (blocks.length === 0) renameTab(id, titleFor(input.text))
      void submit(id, input, ctx)
    },
    [ctx, submit, tabId, createAskTab, bindAskTab, renameTab, blocks.length]
  )

  const openInEditor = useCallback(
    (sql: string) => setActiveTab(createQueryTab(connection?.id ?? null, sql)),
    [connection?.id, createQueryTab, setActiveTab]
  )

  useEffect(() => {
    if (!ctx || !tabId || schemasLoading) return
    const queued = useAskStore.getState().takeQueued(tabId)
    if (queued) ask(queued)
  }, [ctx, tabId, ask, schemasLoading])

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [blocks])

  if (!connection) return <ConnectionPrompt />

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {blocks.length === 0 ? (
          <div className="mx-auto flex h-full max-w-4xl flex-col justify-end px-6 pb-6">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <DatabaseIcon dbType={connection.dbType} className="size-3.5" />
              {connection.name}
              <span className="text-muted-foreground/40">
                · {schemas.reduce((n, s) => n + s.tables.length, 0)} tables
              </span>
            </div>
            <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground">
              What do you want to know?
            </h1>
            <p className="mt-1 font-sans text-[13px] text-muted-foreground">
              Ask in plain English and the assistant writes the SQL, runs it if it only reads, and
              explains what came back. Or type SQL and it runs directly.
            </p>
            {starters.length > 0 && (
              <div className="mt-5 grid gap-1">
                {starters.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => composer.current?.fill(s.text, s.mode)}
                    className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {s.mode === 'sql' ? (
                      <ChevronRight className="size-3.5 text-emerald-400/70" />
                    ) : (
                      <Sparkles className="size-3.5 text-primary/70" />
                    )}
                    <span className={s.mode === 'sql' ? 'font-mono text-xs' : 'font-sans'}>
                      {s.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4 px-6 py-5">
            {blocks.map((block) => (
              <AskBlockView
                key={block.id}
                block={block}
                actions={{
                  run: () => ctx && void run(sessionKey, block.id, ctx),
                  cancel: () => cancel(sessionKey, block.id),
                  stop: () => stop(sessionKey, block.id),
                  editSql: (sql) => editSql(sessionKey, block.id, sql),
                  remove: () => remove(sessionKey, block.id),
                  ask: (text, context) => ask({ mode: 'ask', text, context }),
                  openInEditor,
                  runSql: (sql, flagged) => ask({ mode: 'sql', text: sql, fromAi: { flagged } }),
                  canAsk: !!provider && !thinking
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-4xl px-6 pb-4 pt-2">
        {ctx ? (
          <AskComposer
            ref={composer}
            connectionName={connection.name}
            history={history}
            thinking={thinking}
            onSubmit={ask}
          />
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px]">
            <DatabaseIcon dbType={connection.dbType} className="size-4" />
            <span className="flex-1 text-muted-foreground">
              This tab asks <span className="text-foreground">{connection.name}</span>
              {activeConnectionId ? ', but the sidebar is on another database.' : '.'}
            </span>
            <button
              type="button"
              onClick={() => selectConnection(connection.id)}
              className="rounded border border-primary/40 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
            >
              {activeConnectionId ? 'Switch to' : 'Connect to'} {connection.name}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
