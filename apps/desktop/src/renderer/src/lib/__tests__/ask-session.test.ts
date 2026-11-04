import { describe, expect, it } from 'vitest'
import type { AIChatResponse } from '@shared/index'
import { gateFor, toAnswer, toHistory, toStored, type AskBlock } from '../ask-session'

const response = (patch: Partial<AIChatResponse>): AIChatResponse => ({
  type: 'message',
  message: '',
  sql: null,
  explanation: null,
  warning: null,
  requiresConfirmation: null,
  title: null,
  description: null,
  chartType: null,
  xKey: null,
  yKeys: null,
  label: null,
  format: null,
  tables: null,
  widgets: null,
  suggestions: null,
  ...patch
})

const block = (patch: Partial<AskBlock>): AskBlock => ({
  id: crypto.randomUUID(),
  mode: 'ask',
  prompt: '',
  sql: null,
  ai: null,
  run: { status: 'idle' },
  createdAt: 0,
  ...patch
})

describe('gateFor', () => {
  it('runs SQL the user marked as SQL, even writes', () => {
    expect(gateFor('typed-locked', 'delete from t', false)).toEqual({
      action: 'run',
      readOnly: false
    })
  })

  it('holds a write the composer only guessed was SQL', () => {
    expect(gateFor('typed', "delete from orders where status = 'test'", false).action).toBe('hold')
  })

  it('runs a guessed read directly and AI reads in a read-only transaction', () => {
    expect(gateFor('typed', 'select 1', false)).toEqual({ action: 'run', readOnly: false })
    expect(gateFor('ai', 'select * from users', false)).toEqual({ action: 'run', readOnly: true })
  })

  it('holds AI writes and multi-statement SQL', () => {
    expect(gateFor('ai', "update users set name = 'x'", false).action).toBe('hold')
    expect(gateFor('ai', 'select 1; drop table users', false).action).toBe('hold')
  })

  it('holds reads the model flagged for review', () => {
    expect(gateFor('ai', 'select * from users', true).action).toBe('hold')
  })

  it('does nothing without SQL', () => {
    expect(gateFor('ai', null, false)).toEqual({ action: 'none' })
  })
})

describe('toAnswer', () => {
  it('maps a chart response to a chart visual', () => {
    const answer = toAnswer(
      response({ type: 'chart', sql: 'select 1', chartType: 'line', xKey: 'day', yKeys: ['n'] })
    )
    expect(answer.visual).toEqual({
      kind: 'chart',
      title: '',
      chartType: 'line',
      xKey: 'day',
      yKeys: ['n']
    })
    expect(answer.sql).toBe('select 1')
  })

  it('falls back to the first report widget for SQL and chart', () => {
    const answer = toAnswer(
      response({
        type: 'report',
        widgets: [{ title: 'Signups', kind: 'chart', sql: 'select 2', xKey: 'd', yKeys: ['n'] }]
      })
    )
    expect(answer.sql).toBe('select 2')
    expect(answer.visual?.kind).toBe('chart')
    expect(answer.more).toEqual([])
  })

  it('keeps the other report widgets so they can run on demand', () => {
    const answer = toAnswer(
      response({
        type: 'report',
        widgets: [
          { title: 'Total', kind: 'kpi', sql: 'select count(*) from t' },
          { title: 'By status', kind: 'table', sql: 'select status, count(*) from t group by 1' }
        ]
      })
    )
    expect(answer.sql).toBe('select count(*) from t')
    expect(answer.more).toEqual([
      { title: 'By status', sql: 'select status, count(*) from t group by 1' }
    ])
  })
})

describe('toHistory', () => {
  it('folds hand-run SQL into the next question as context, without row values', () => {
    const blocks = [
      block({
        mode: 'sql',
        prompt: 'select email from users',
        sql: 'select email from users',
        run: {
          status: 'done',
          result: {
            columns: [{ name: 'email', type: 'text' }],
            rows: [{ email: 'secret@example.com' }],
            rowCount: 1,
            durationMs: 1
          }
        }
      })
    ]
    const history = toHistory(blocks, 'how many are there?')
    expect(history).toHaveLength(1)
    expect(history[0].role).toBe('user')
    expect(history[0].content).toContain('select email from users')
    expect(history[0].content).toContain('1 row(s) with columns: email')
    expect(history[0].content).not.toContain('secret@example.com')
    expect(history[0].content).toMatch(/how many are there\?$/)
  })

  it('replays answered questions as user and assistant turns, sending hidden context', () => {
    const blocks = [
      block({
        prompt: 'Fix: boom',
        context: 'full fix prompt',
        sql: 'select 1',
        ai: {
          status: 'done',
          narration: 'Fixed it.',
          grounded: false,
          visual: null,
          suggestions: [],
          warning: null,
          more: [],
          flagged: false
        }
      }),
      block({
        prompt: 'still thinking',
        ai: { status: 'thinking', requestId: 'r1', narration: '' }
      })
    ]
    const history = toHistory(blocks, 'next')
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(history[0].content).toBe('full fix prompt')
    expect(history[1].content).toContain('Fixed it.')
    expect(history[1].content).toContain('select 1')
  })

  it('credits AI-written SQL to the assistant, not the user', () => {
    const history = toHistory(
      [
        block({
          mode: 'sql',
          fromAi: true,
          prompt: 'select 1',
          sql: 'select 1',
          run: { status: 'error', message: 'boom' }
        })
      ],
      'why?'
    )
    expect(history[0].content).toContain('I ran this query you suggested:')
  })

  it('says when SQL was held and never ran', () => {
    const history = toHistory(
      [
        block({
          mode: 'sql',
          prompt: 'delete from t',
          sql: 'delete from t',
          run: { status: 'needs-approval', reason: 'This statement can change data.' }
        })
      ],
      'how many rows are left?'
    )
    expect(history[0].content).toContain('I typed:')
    expect(history[0].content).toContain('It has not been run.')
  })
})

describe('toStored', () => {
  it('marks in-flight work as interrupted and drops row values but keeps the shape', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ n: i }))
    const [thinking, running, done] = toStored([
      block({ ai: { status: 'thinking', requestId: 'r', narration: 'half' } }),
      block({ mode: 'sql', sql: 'select 1', run: { status: 'running', executionId: 'e' } }),
      block({
        mode: 'sql',
        sql: 'select n',
        run: {
          status: 'done',
          result: { columns: [{ name: 'n', type: 'int4' }], rows, rowCount: 120, durationMs: 1 }
        }
      })
    ])
    expect(thinking.ai).toEqual({ status: 'error', message: 'Interrupted' })
    expect(running.run).toEqual({ status: 'error', message: 'Interrupted' })
    expect(done.run.status === 'done' && done.run.result.rows).toHaveLength(0)
    expect(done.run.status === 'done' && done.run.result.rowCount).toBe(120)
    expect(done.run.status === 'done' && done.run.result.columns).toEqual([
      { name: 'n', type: 'int4' }
    ])
  })

  it('keeps only the most recent blocks', () => {
    const blocks = Array.from({ length: 45 }, (_, i) => block({ prompt: `q${i}` }))
    const kept = toStored(blocks)
    expect(kept).toHaveLength(40)
    expect(kept[0].prompt).toBe('q5')
  })

  it('fills in fields that history saved by older versions lacks', () => {
    const legacy = block({
      ai: {
        status: 'done',
        narration: 'old',
        grounded: false,
        visual: null,
        suggestions: [],
        warning: null
      } as unknown as AskBlock['ai']
    })
    const [restored] = toStored([legacy])
    expect(restored.ai?.status === 'done' && restored.ai.more).toEqual([])
    expect(restored.ai?.status === 'done' && restored.ai.suggestions).toEqual([])
    expect(restored.ai?.status === 'done' && restored.ai.flagged).toBe(false)
  })
})
