import type { AIChatResponse, AIMessage } from '@shared/index'
import { isReadOnlySql } from '@shared/index'
import type { AskMode } from './ask-input'

export interface AskResult {
  columns: Array<{ name: string; type: string }>
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

export type RunState =
  | { status: 'idle' }
  | { status: 'needs-approval'; reason: string }
  | { status: 'running'; executionId: string }
  | { status: 'done'; result: AskResult }
  | { status: 'error'; message: string }

export type AskVisual =
  | {
      kind: 'chart'
      title: string
      chartType: 'bar' | 'line' | 'pie' | 'area'
      xKey: string
      yKeys: string[]
    }
  | { kind: 'metric'; label: string; format: 'number' | 'currency' | 'percent' | 'duration' }

export type AiState =
  | { status: 'thinking'; requestId: string; narration: string; activity?: string }
  | {
      status: 'done'
      narration: string
      grounded: boolean
      visual: AskVisual | null
      suggestions: string[]
      warning: string | null
      /** The other parts of a multi-part ("report") answer, run on demand. */
      more: Array<{ title: string; sql: string }>
      /** The model asked for review; its extra queries are held too. */
      flagged: boolean
    }
  | { status: 'error'; message: string }

export interface AskBlock {
  id: string
  mode: AskMode
  /** The user picked the mode with Tab rather than the composer guessing it. */
  locked?: boolean
  /** A SQL block the assistant wrote rather than the user. */
  fromAi?: boolean
  prompt: string
  /** Extra text sent to the model but not shown, e.g. the failing SQL for a fix. */
  context?: string
  sql: string | null
  ai: AiState | null
  run: RunState
  createdAt: number
}

export interface AiAnswer {
  narration: string
  sql: string | null
  visual: AskVisual | null
  suggestions: string[]
  warning: string | null
  more: Array<{ title: string; sql: string }>
  /** The model asked for a human to look before running (writes, risky reads). */
  requiresConfirmation: boolean
}

export function toAnswer(data: AIChatResponse): AiAnswer {
  const firstWidget = data.widgets?.find((w) => w.sql)
  const sql = data.sql ?? firstWidget?.sql ?? null
  let visual: AskVisual | null = null
  if (data.type === 'chart' && data.chartType && data.xKey && data.yKeys?.length) {
    visual = {
      kind: 'chart',
      title: data.title ?? '',
      chartType: data.chartType,
      xKey: data.xKey,
      yKeys: data.yKeys
    }
  } else if (data.type === 'metric' && data.label && data.format) {
    visual = { kind: 'metric', label: data.label, format: data.format }
  } else if (firstWidget?.kind === 'chart' && firstWidget.xKey && firstWidget.yKeys?.length) {
    visual = {
      kind: 'chart',
      title: firstWidget.title,
      chartType: firstWidget.chartType ?? 'bar',
      xKey: firstWidget.xKey,
      yKeys: firstWidget.yKeys
    }
  }
  return {
    narration: data.message,
    sql,
    visual,
    suggestions: data.suggestions ?? [],
    warning: data.warning,
    more: (data.widgets ?? [])
      .filter((w) => w.sql && w !== firstWidget)
      .map((w) => ({ title: w.title, sql: w.sql })),
    requiresConfirmation: !!data.requiresConfirmation
  }
}

/**
 * Who put the SQL in the block. `typed-locked` means the user pressed Tab to
 * say "this is SQL"; `typed` means the composer only guessed it was.
 */
export type SqlOrigin = 'typed-locked' | 'typed' | 'ai'

export type RunGate =
  { action: 'run'; readOnly: boolean } | { action: 'hold'; reason: string } | { action: 'none' }

/**
 * What happens to SQL once it lands in a block. SQL the user marked as SQL
 * runs as written. Everything else runs on its own only when it is a single
 * read-only statement, and AI SQL then runs in a read-only transaction so a
 * function that writes can't get through. Anything else waits for a click.
 */
export function gateFor(origin: SqlOrigin, sql: string | null, flagged: boolean): RunGate {
  if (!sql) return { action: 'none' }
  if (origin === 'typed-locked') return { action: 'run', readOnly: false }
  if (flagged) return { action: 'hold', reason: 'The assistant asked for a review first.' }
  if (!isReadOnlySql(sql)) return { action: 'hold', reason: 'This statement can change data.' }
  return { action: 'run', readOnly: origin === 'ai' }
}

function describeResult(run: RunState): string {
  if (run.status === 'done') {
    const cols = run.result.columns.map((c) => c.name).join(', ')
    return `It returned ${run.result.rowCount} row(s) with columns: ${cols || 'none'}.`
  }
  if (run.status === 'error') return `It failed with: ${run.message}`
  return 'It has not been run.'
}

/**
 * Turns the timeline into chat history. SQL the user ran by hand is folded
 * into the next question as context, so the model knows what they were
 * looking at. Row values never leave the app here, only shapes and counts.
 */
export function toHistory(blocks: AskBlock[], prompt: string): AIMessage[] {
  const messages: AIMessage[] = []
  let context: string[] = []
  for (const block of blocks) {
    if (block.mode === 'sql') {
      const ran = block.run.status === 'done' || block.run.status === 'error'
      const who = block.fromAi
        ? `I ${ran ? 'ran' : 'did not run'} this query you suggested`
        : `I ${ran ? 'ran' : 'typed'}`
      context.push(
        `${who}:\n\`\`\`sql\n${block.sql ?? block.prompt}\n\`\`\`\n${describeResult(block.run)}`
      )
      continue
    }
    if (block.ai?.status !== 'done') continue
    messages.push({
      role: 'user',
      content: [...context, block.context ?? block.prompt].join('\n\n')
    })
    context = []
    const parts = [block.ai.narration]
    if (block.sql) parts.push(`\`\`\`sql\n${block.sql}\n\`\`\``, describeResult(block.run))
    messages.push({ role: 'assistant', content: parts.filter(Boolean).join('\n\n') })
  }
  messages.push({ role: 'user', content: [...context, prompt].join('\n\n') })
  return messages
}

export function fixPrompt(sql: string, error: string): string {
  return `This query failed with "${error}". Fix it and explain the cause in one sentence.\n\`\`\`sql\n${sql}\n\`\`\``
}

const KEEP_BLOCKS = 40
/**
 * The slice of a timeline worth keeping across restarts: recent blocks and
 * the shape of each result, but no row values, so query data never lands in
 * an unencrypted file on disk. Nothing mid-flight survives, since the query
 * or CLI behind it is gone once the app quits.
 */
export function toStored(blocks: AskBlock[]): AskBlock[] {
  return blocks.slice(-KEEP_BLOCKS).map((b) => {
    const ai: AiState | null =
      b.ai?.status === 'thinking'
        ? { status: 'error', message: 'Interrupted' }
        : b.ai?.status === 'done'
          ? {
              ...b.ai,
              more: b.ai.more ?? [],
              suggestions: b.ai.suggestions ?? [],
              flagged: b.ai.flagged ?? false
            }
          : b.ai
    let run: RunState = b.run
    if (run.status === 'running') run = { status: 'error', message: 'Interrupted' }
    else if (run.status === 'done' && run.result.rows.length > 0) {
      run = { ...run, result: { ...run.result, rows: [] } }
    }
    return { ...b, ai, run }
  })
}
