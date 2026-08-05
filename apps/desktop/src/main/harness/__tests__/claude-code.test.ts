import { describe, it, expect } from 'vitest'
import {
  claudeCodeAdapter,
  buildClaudeArgs,
  buildClaudeMcpConfigJson,
  claudeAllowedTools,
  classifyClaudeLine,
  MCP_READ_TOOLS
} from '../adapters/claude-code'
import type { HarnessInput } from '../types'

const input = (over: Partial<HarnessInput> = {}): HarnessInput => ({
  kind: 'chat',
  userPrompt: 'list users',
  systemPrompt: 'SYS',
  model: 'sonnet',
  stream: false,
  workDir: '/tmp/x',
  ...over
})

describe('claude buildRequest', () => {
  it('builds a one-shot json invocation with system prompt and model', () => {
    const req = claudeCodeAdapter.buildRequest(input())
    expect(req.args).toEqual([
      '-p',
      'list users',
      '--output-format',
      'json',
      '--append-system-prompt',
      'SYS',
      '--model',
      'sonnet'
    ])
  })

  it('adds stream flags and --json-schema when asked', () => {
    const req = claudeCodeAdapter.buildRequest(input({ stream: true, jsonSchema: '{}' }))
    expect(req.args).toContain('stream-json')
    expect(req.args).toContain('--verbose')
    expect(req.args).toContain('--include-partial-messages')
    expect(req.args).toContain('--json-schema')
  })

  it('adds --resume with the session id', () => {
    const req = claudeCodeAdapter.buildRequest(input({ resumeSessionId: 'sess-9' }))
    expect(req.args).toContain('--resume')
    expect(req.args[req.args.indexOf('--resume') + 1]).toBe('sess-9')
  })

  it('drops ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the child env', () => {
    const prev = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-leak'
    try {
      const req = claudeCodeAdapter.buildRequest(input())
      expect(req.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(req.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prev
    }
  })

  it('wires agentic MCP: config, strict isolation, read-tools allow-list', () => {
    const req = claudeCodeAdapter.buildRequest(
      input({
        mcp: {
          port: 4722,
          token: 'secret-tok',
          url: 'http://127.0.0.1:4722/mcp',
          connectionId: 'c1'
        }
      })
    )
    expect(req.args).toContain('--mcp-config')
    expect(req.args).toContain('--strict-mcp-config')
    const allowed = req.args[req.args.indexOf('--allowedTools') + 1]
    expect(allowed).toBe(
      'mcp__datapeek__list_schemas,mcp__datapeek__run_query,mcp__datapeek__explain_query'
    )
    const cfg = JSON.parse(req.args[req.args.indexOf('--mcp-config') + 1])
    expect(cfg.mcpServers.datapeek.url).toBe('http://127.0.0.1:4722/mcp')
    expect(cfg.mcpServers.datapeek.headers.Authorization).toBe('Bearer secret-tok')
    expect(MCP_READ_TOOLS).not.toContain('execute_statement' as never)
  })

  it('exposes the pure helpers used by buildRequest', () => {
    expect(claudeAllowedTools()).toEqual([
      'mcp__datapeek__list_schemas',
      'mcp__datapeek__run_query',
      'mcp__datapeek__explain_query'
    ])
    const cfg = JSON.parse(buildClaudeMcpConfigJson('http://127.0.0.1:4722/mcp', 'secret-tok'))
    expect(cfg.mcpServers.datapeek.headers.Authorization).toBe('Bearer secret-tok')
    expect(buildClaudeArgs(input())).toContain('--model')
  })
})

describe('claude run collector', () => {
  const query = { type: 'query', message: 'ok', sql: 'SELECT 1' }
  const envelope = (result: string, extra: Record<string, unknown> = {}) => ({
    type: 'result',
    session_id: 's1',
    result,
    ...extra
  })

  it('captures the result envelope and reports stats', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope(JSON.stringify(query), { num_turns: 3, permission_denials: [] }))
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toBe(JSON.stringify(query))
    expect(res.stats).toEqual({ toolRoundTrips: 2, denials: 0, sessionId: 's1' })
  })

  it('prefers structured_output when present', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope('ignored', { structured_output: query }))
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toEqual(query)
  })

  it('throws the envelope error message (e.g. credit balance) even on exit 0', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope('Credit balance is too low', { is_error: true }))
    expect(() => run.finish({ code: 1, stderr: 'noise' })).toThrow(/credit balance/i)
  })

  it('throws with stderr detail when no envelope arrived', () => {
    const run = claudeCodeAdapter.createRun()
    expect(() => run.finish({ code: 1, stderr: 'boom' })).toThrow(/boom/)
  })

  it('classifies text deltas, json deltas, and grounding tool labels', () => {
    const run = claudeCodeAdapter.createRun()
    expect(
      run.onLine({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } }
      }).textDelta
    ).toBe('hel')
    expect(
      run.onLine({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{"m' }
        }
      }).jsonDelta
    ).toBe('{"m')
    expect(
      run.onLine({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'mcp__datapeek__run_query' }] }
      }).toolLabel
    ).toBe('Running query…')
    // The CLI's internal StructuredOutput tool is an output mechanism, not activity.
    expect(
      run.onLine({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'StructuredOutput' }] }
      }).toolLabel
    ).toBeUndefined()
  })
})

describe('classifyClaudeLine noise + thinking deltas', () => {
  it('does not surface thinking deltas as answer content', () => {
    const info = classifyClaudeLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } }
    })
    expect(info).toEqual({})
  })

  it('ignores non-text stream events', () => {
    expect(classifyClaudeLine({ type: 'stream_event', event: { type: 'message_start' } })).toEqual(
      {}
    )
  })

  it('ignores noise frames and non-objects without throwing', () => {
    expect(classifyClaudeLine({ type: 'rate_limit_event' })).toEqual({})
    expect(classifyClaudeLine({ type: 'system', subtype: 'hook_started' })).toEqual({})
    expect(classifyClaudeLine(null)).toEqual({})
    expect(classifyClaudeLine('boom')).toEqual({})
  })
})
