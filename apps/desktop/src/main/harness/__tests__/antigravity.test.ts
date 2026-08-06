import { describe, it, expect } from 'vitest'
import { antigravityAdapter, buildAntigravityArgs, toGeminiSchema } from '../adapters/antigravity'
import { RESPONSE_JSON_SCHEMA_STRING } from '../../ai-schema'
import type { HarnessInput } from '../types'

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

// Real fixtures captured live, 2026-08-06, agy 1.1.8. `--json-schema` only
// works in stream-json mode (plain json mode returns an empty response), and
// the validated object arrives on the terminal result event as
// `structured_output` alongside the raw `response` text. STEP_DELTA_EVENT is
// a mid-run step_update: agent_response steps carry a text_delta (the
// structured JSON, when a schema is set), delivered per completed step rather
// than token-by-token.
const RESULT_EVENT = {
  event: 'result',
  result: {
    conversation_id: '7cf036dc-b6d8-45cf-8e04-9a66d7706584',
    status: 'SUCCESS',
    response: '{"message":"hello","toolAction":"Finishing task","type":"message"}\n',
    duration_seconds: 2.758459,
    num_turns: 1,
    structured_output: { message: 'hello', type: 'message' },
    usage: { input_tokens: 25039, output_tokens: 556 }
  }
}

const STEP_DELTA_EVENT = {
  event: 'step_update',
  step_update: {
    conversation_id: '9aaeb4e8-0ce7-410e-8b93-075995f27d75',
    step_index: 2,
    state: 'DONE',
    step_type: 'agent_response',
    text_delta: '{"message":"hel',
    duration_seconds: 1.471092
  }
}

describe('buildAntigravityArgs', () => {
  it('runs print mode with stream-json output (json mode breaks --json-schema)', () => {
    const args = buildAntigravityArgs(input())
    expect(args[0]).toBe('-p')
    expect(args[1]).toBe('## Instructions\nSYS\n\n## Request\nhow many users?')
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(args).toContain('--sandbox')
  })

  it('passes the JSON schema inline and omits it when absent', () => {
    const args = buildAntigravityArgs(input())
    expect(args[args.indexOf('--json-schema') + 1]).toBe('{"type":"object"}')
    expect(buildAntigravityArgs(input({ jsonSchema: undefined }))).not.toContain('--json-schema')
  })

  // Gemini's structured-output dialect rejects null inside enum arrays
  // (live-bisected on agy 1.1.8: the untouched chat schema errors in ~1s;
  // stripping enum nulls fixes it, with nullability kept by the type unions).
  it('strips null enum members from the staged schema', () => {
    const args = buildAntigravityArgs(input({ jsonSchema: RESPONSE_JSON_SCHEMA_STRING }))
    const staged = JSON.parse(args[args.indexOf('--json-schema') + 1])
    const assertNoNullEnums = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(assertNoNullEnums)
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (Array.isArray(obj.enum)) expect(obj.enum).not.toContain(null)
      Object.values(obj).forEach(assertNoNullEnums)
    }
    assertNoNullEnums(staged)
    expect(staged.properties.chartType.enum).toEqual(['bar', 'line', 'pie', 'area'])
    expect(staged.properties.chartType.type).toEqual(['string', 'null'])
  })

  it('toGeminiSchema is identity for enum-free schemas and non-JSON input', () => {
    expect(toGeminiSchema('{"type":"object"}')).toBe('{"type":"object"}')
    expect(toGeminiSchema('not json')).toBe('not json')
  })

  it('omits --model for the CLI-default model and passes explicit models through', () => {
    expect(buildAntigravityArgs(input({ model: '' }))).not.toContain('--model')
    expect(buildAntigravityArgs(input({ model: 'default' }))).not.toContain('--model')
    const args = buildAntigravityArgs(input({ model: 'gemini-3-pro' }))
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-3-pro')
  })

  it('resumes via --conversation with only the user prompt', () => {
    const args = buildAntigravityArgs(input({ resumeSessionId: 'conv-7', userPrompt: 'and now?' }))
    expect(args[args.indexOf('--conversation') + 1]).toBe('conv-7')
    expect(args[1]).toBe('and now?')
    // Unlike codex's `exec resume`, agy accepts --sandbox on resumed
    // conversations (verified live, agy 1.1.8) — pin that it stays on.
    expect(args).toContain('--sandbox')
  })

  it('stages no temp files (the schema travels inline via --json-schema)', () => {
    expect(antigravityAdapter.buildRequest(input()).tempFiles).toBeUndefined()
  })

  it('drops Google API keys so agy rides its own login', () => {
    const prevGemini = process.env.GEMINI_API_KEY
    const prevGoogle = process.env.GOOGLE_API_KEY
    process.env.GEMINI_API_KEY = 'should-not-leak'
    process.env.GOOGLE_API_KEY = 'should-not-leak'
    try {
      const req = antigravityAdapter.buildRequest(input())
      expect(req.env.GEMINI_API_KEY).toBeUndefined()
      expect(req.env.GOOGLE_API_KEY).toBeUndefined()
    } finally {
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = prevGemini
      if (prevGoogle === undefined) delete process.env.GOOGLE_API_KEY
      else process.env.GOOGLE_API_KEY = prevGoogle
    }
  })

  it('runs inside the per-run work dir (agy has no --cd flag)', () => {
    expect(antigravityAdapter.buildRequest(input()).cwd).toBe('/tmp/run-1')
  })
})

describe('antigravity run collector', () => {
  it('prefers structured_output from the result event and reports the session id', () => {
    const run = antigravityAdapter.createRun()
    run.onLine(STEP_DELTA_EVENT)
    run.onLine(RESULT_EVENT)
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toEqual({ message: 'hello', type: 'message' })
    expect(res.stats).toEqual({
      toolRoundTrips: 0,
      denials: 0,
      sessionId: '7cf036dc-b6d8-45cf-8e04-9a66d7706584'
    })
  })

  it('falls back to the raw response text when structured_output is absent', () => {
    const run = antigravityAdapter.createRun()
    const { structured_output: _dropped, ...rest } = RESULT_EVENT.result
    run.onLine({ event: 'result', result: rest })
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toBe(RESULT_EVENT.result.response)
  })

  it('surfaces agent_response deltas as json deltas for live message extraction', () => {
    const run = antigravityAdapter.createRun()
    expect(run.onLine(STEP_DELTA_EVENT).jsonDelta).toBe('{"message":"hel')
  })

  it('throws with the response text when the result status is not SUCCESS', () => {
    const run = antigravityAdapter.createRun()
    run.onLine({
      event: 'result',
      result: { conversation_id: 'x', status: 'ERROR', response: 'quota exceeded' }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/quota exceeded/)
  })

  // Real failure shape captured live: empty response, dedicated error field.
  it('surfaces the error field when the response is empty', () => {
    const run = antigravityAdapter.createRun()
    run.onLine({
      event: 'result',
      result: {
        conversation_id: 'x',
        status: 'ERROR',
        response: '',
        error: 'Agent execution terminated due to error.'
      }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/terminated due to error/)
  })

  it('prefers the error field over leftover response text when both are present', () => {
    const run = antigravityAdapter.createRun()
    run.onLine({
      event: 'result',
      result: {
        conversation_id: 'x',
        status: 'ERROR',
        response: '{"type":"met',
        error: 'model overloaded'
      }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/model overloaded/)
  })

  it('falls back to the status when neither response nor error carries detail', () => {
    const run = antigravityAdapter.createRun()
    run.onLine({
      event: 'result',
      result: { conversation_id: 'x', status: 'CANCELLED', response: '' }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/status CANCELLED/)
  })

  it('throws with stderr detail when no result event ever arrived', () => {
    const run = antigravityAdapter.createRun()
    run.onLine(STEP_DELTA_EVENT)
    expect(() => run.finish({ code: 1, stderr: 'boom' })).toThrow(/boom/)
  })

  it('ignores noise events safely', () => {
    const run = antigravityAdapter.createRun()
    expect(run.onLine({ event: 'init', conversation_id: 'c', init: { tools: [] } })).toEqual({})
    expect(run.onLine(null)).toEqual({})
    expect(run.onLine('boom')).toEqual({})
    // A result event with a malformed result field is noise, not a reply.
    expect(run.onLine({ event: 'result', result: null })).toEqual({})
    expect(run.onLine({ event: 'result', result: 'oops' })).toEqual({})
  })
})

describe('adapter contract', () => {
  it('ships chat-only: no agentic grounding or dashboards yet', () => {
    expect(antigravityAdapter.capabilities).toEqual({
      streaming: false,
      resume: true,
      dashboard: false,
      agentic: false
    })
    expect(antigravityAdapter.id).toBe('antigravity-cli')
    expect(antigravityAdapter.cliLabel).toBe('Antigravity CLI')
    expect(antigravityAdapter.notFoundMessage).toMatch(/agy/)
  })
})
