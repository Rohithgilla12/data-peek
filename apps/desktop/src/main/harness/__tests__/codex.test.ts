import { describe, it, expect } from 'vitest'
import {
  codexAdapter,
  buildCodexArgs,
  composeCodexPrompt,
  friendlyCodexError,
  toOpenAiStrictSchema
} from '../adapters/codex'
import { RESPONSE_JSON_SCHEMA_STRING } from '../../ai-schema'
import type { HarnessInput } from '../types'

// OpenAI structured outputs run in strict mode: every object level must list
// every property key in `required`. Regression for the live-verified 400
// ("Invalid schema for response_format 'codex_output_schema' ... Missing
// 'chartType'") the untransformed schema triggers.
describe('toOpenAiStrictSchema', () => {
  const assertStrict = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => assertStrict(v, `${path}[${i}]`))
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (obj.properties && typeof obj.properties === 'object') {
      const keys = Object.keys(obj.properties as Record<string, unknown>).sort()
      expect((obj.required as string[]).slice().sort(), `required at ${path}`).toEqual(keys)
    }
    for (const [k, v] of Object.entries(obj)) assertStrict(v, `${path}.${k}`)
  }

  it('makes the real chat response schema strict at every object level', () => {
    const widened = JSON.parse(toOpenAiStrictSchema(RESPONSE_JSON_SCHEMA_STRING))
    assertStrict(widened, '$')
    const widgetItem = widened.properties.widgets.items
    expect(widgetItem.required).toContain('chartType')
    expect(widened.required).toContain('suggestions')
  })

  it('is identity for schemas without properties and for non-JSON input', () => {
    expect(toOpenAiStrictSchema('{"type":"object"}')).toBe('{"type":"object"}')
    expect(toOpenAiStrictSchema('not json')).toBe('not json')
  })
})

const input = (over: Partial<HarnessInput> = {}): HarnessInput => ({
  kind: 'chat',
  userPrompt: 'how many users?',
  systemPrompt: 'SYS',
  model: '',
  jsonSchema: '{"type":"object"}',
  stream: false,
  workDir: '/tmp/run-1',
  ...over
})

// Real fixture captured live, 2026-08-05, codex-cli 0.146.0 — confirms the
// upstream headless-approval bug (openai/codex#24135) the codex adapter's
// agentic: false capability works around: the CLI itself auto-cancels the
// MCP tool call, so the collector must surface it as a denial, not a success.
const CANCELLED_TOOL_CALL_LINES = [
  { type: 'thread.started', thread_id: '019fd319-a8a6-70a1-987b-6a57d21ec6c9' },
  {
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'datapeek',
      tool: 'run_query',
      arguments: { connectionId: 'c1', sql: 'SELECT count(*) FROM users' },
      result: null,
      error: null,
      status: 'in_progress'
    }
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'datapeek',
      tool: 'run_query',
      arguments: { connectionId: 'c1', sql: 'SELECT count(*) FROM users' },
      result: null,
      error: { message: 'user cancelled MCP tool call' },
      status: 'failed'
    }
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_2',
      type: 'agent_message',
      text: '{"message":"Unable to run the query: the database tool call was cancelled."}'
    }
  }
]

const SUCCESS_LINES = [
  { type: 'thread.started', thread_id: '019fd2bf-ffe8-7c23-bd20-436c6938519f' },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: { id: 'item_0', type: 'error', message: 'Skill descriptions were shortened…' }
  },
  {
    type: 'item.completed',
    item: { id: 'item_1', type: 'agent_message', text: '{"message":"Hello! How can I help?"}' }
  },
  { type: 'turn.completed', usage: { input_tokens: 19925, output_tokens: 21 } }
]

describe('buildCodexArgs', () => {
  it('runs exec with json output, read-only sandbox, and hermetic config', () => {
    const args = buildCodexArgs(input())
    expect(args[0]).toBe('exec')
    expect(args).toContain('--json')
    expect(args).toContain('--skip-git-repo-check')
    expect(args).toContain('--ignore-user-config')
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
    expect(args[args.indexOf('--cd') + 1]).toBe('/tmp/run-1')
  })

  it('prepends the system prompt into the prompt body (no --append-system-prompt in codex)', () => {
    const args = buildCodexArgs(input())
    const prompt = args[1]
    expect(prompt).toBe(composeCodexPrompt('SYS', 'how many users?'))
    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('## Request')
  })

  it('omits -m for the CLI-default model and passes explicit models through', () => {
    expect(buildCodexArgs(input({ model: '' }))).not.toContain('--model')
    expect(buildCodexArgs(input({ model: 'default' }))).not.toContain('--model')
    const args = buildCodexArgs(input({ model: 'gpt-5.1-codex' }))
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5.1-codex')
  })

  it('points --output-schema at a temp file inside the work dir', () => {
    const req = codexAdapter.buildRequest(input())
    const schemaPath = req.args[req.args.indexOf('--output-schema') + 1]
    expect(schemaPath).toBe('/tmp/run-1/output-schema.json')
    expect(req.tempFiles).toEqual([
      { path: '/tmp/run-1/output-schema.json', content: '{"type":"object"}' }
    ])
  })

  it('omits --output-schema when no schema is given (dashboard path)', () => {
    const req = codexAdapter.buildRequest(input({ jsonSchema: undefined }))
    expect(req.args).not.toContain('--output-schema')
    expect(req.tempFiles ?? []).toEqual([])
  })

  it('widens the staged schema to OpenAI strict mode (all keys required)', () => {
    const loose = JSON.stringify({
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' }, b: { type: ['string', 'null'] } }
    })
    const req = codexAdapter.buildRequest(input({ jsonSchema: loose }))
    const staged = JSON.parse(req.tempFiles![0].content)
    expect(staged.required).toEqual(['a', 'b'])
  })

  it('drops OPENAI_API_KEY so codex rides its own login', () => {
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-should-not-leak'
    try {
      expect(codexAdapter.buildRequest(input()).env.OPENAI_API_KEY).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
  })
})

describe('codex run collector', () => {
  it('collects the agent message, session id, and clean stats from a real run', () => {
    const run = codexAdapter.createRun()
    const infos = SUCCESS_LINES.map((l) => run.onLine(l))
    // the structured reply surfaces as a json delta so the service can stream the message field
    expect(infos[3].jsonDelta).toBe('{"message":"Hello! How can I help?"}')
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toBe('{"message":"Hello! How can I help?"}')
    expect(res.stats).toEqual({
      toolRoundTrips: 0,
      denials: 0,
      sessionId: '019fd2bf-ffe8-7c23-bd20-436c6938519f'
    })
  })

  it('treats item-level error items as non-fatal (real runs emit warnings that way)', () => {
    const run = codexAdapter.createRun()
    SUCCESS_LINES.forEach((l) => run.onLine(l))
    expect(() => run.finish({ code: 0, stderr: '' })).not.toThrow()
  })

  it('surfaces turn.failed with the inner API message unwrapped', () => {
    const run = codexAdapter.createRun()
    run.onLine({
      type: 'turn.failed',
      error: {
        message:
          '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'totally-bogus-model\' model is not supported when using Codex with a ChatGPT account."}}'
      }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/not supported when using Codex/)
  })

  it('throws with stderr detail when no agent message ever arrived', () => {
    const run = codexAdapter.createRun()
    run.onLine({ type: 'thread.started', thread_id: 't' })
    expect(() => run.finish({ code: 1, stderr: 'something exploded' })).toThrow(
      /something exploded/
    )
  })

  it('labels a cancelled MCP tool call and counts it as a denial (real fixture, 2026-08-05, codex-cli 0.146.0)', () => {
    const run = codexAdapter.createRun()
    const infos = CANCELLED_TOOL_CALL_LINES.map((l) => run.onLine(l))
    expect(infos[1].toolLabel).toBe('Running query…')
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.stats).toEqual({
      toolRoundTrips: 1,
      denials: 1,
      sessionId: '019fd319-a8a6-70a1-987b-6a57d21ec6c9'
    })
  })
})

describe('friendlyCodexError', () => {
  it('maps auth failures to a codex login hint', () => {
    expect(friendlyCodexError('{"status":401,"error":{"message":"Unauthorized"}}')).toMatch(
      /codex login/
    )
  })
  it('unwraps the nested API error message', () => {
    expect(
      friendlyCodexError('{"type":"error","status":400,"error":{"message":"inner detail"}}')
    ).toBe('inner detail')
  })
  it('passes through plain messages untouched', () => {
    expect(friendlyCodexError('stream disconnected')).toBe('stream disconnected')
  })
})
