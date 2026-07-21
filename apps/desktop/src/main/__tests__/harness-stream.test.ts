import { describe, it, expect } from 'vitest'
import { extractPartialMessage, classifyStreamLine, toolLabel } from '../harness-stream'

describe('extractPartialMessage', () => {
  it('returns empty string before the message field appears', () => {
    expect(extractPartialMessage('')).toBe('')
    expect(extractPartialMessage('{"type":"query",')).toBe('')
    expect(extractPartialMessage('{"type":"query","mess')).toBe('')
  })

  it('returns the partial value while the string is still open', () => {
    expect(extractPartialMessage('{"type":"query","message":"Here are the')).toBe('Here are the')
  })

  it('returns the full value once the string closes', () => {
    expect(extractPartialMessage('{"message":"Done.","sql":"SELECT 1"}')).toBe('Done.')
  })

  it('decodes escapes and stops safely on an incomplete escape', () => {
    expect(extractPartialMessage('{"message":"line1\\nline2"')).toBe('line1\nline2')
    expect(extractPartialMessage('{"message":"quote \\"x\\""')).toBe('quote "x"')
    // trailing backslash that hasn't been completed must not throw
    expect(extractPartialMessage('{"message":"end\\')).toBe('end')
  })

  it('handles incomplete unicode escapes without throwing', () => {
    expect(extractPartialMessage('{"message":"a\\u00')).toBe('a')
    expect(extractPartialMessage('{"message":"a\\u0041"')).toBe('aA')
  })

  it('tolerates whitespace between key, colon, and value', () => {
    expect(extractPartialMessage('{ "message" : "hi"')).toBe('hi')
  })
})

describe('classifyStreamLine', () => {
  it('extracts text deltas from stream_event frames', () => {
    const info = classifyStreamLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } }
    })
    expect(info.textDelta).toBe('hello')
  })

  it('extracts json deltas (structured output under --json-schema)', () => {
    const info = classifyStreamLine({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '{"ty' }
      }
    })
    expect(info.jsonDelta).toBe('{"ty')
    expect(info.textDelta).toBeUndefined()
  })

  it('ignores non-text stream events', () => {
    expect(classifyStreamLine({ type: 'stream_event', event: { type: 'message_start' } })).toEqual(
      {}
    )
    // thinking deltas are not answer content
    expect(
      classifyStreamLine({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } }
      })
    ).toEqual({})
  })

  it('labels tool_use from assistant frames', () => {
    const info = classifyStreamLine({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'mcp__datapeek__run_query' }] }
    })
    expect(info.toolLabel).toBe('Running query…')
  })

  it('ignores internal/output tools like StructuredOutput', () => {
    const info = classifyStreamLine({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'StructuredOutput' }] }
    })
    expect(info.toolLabel).toBeUndefined()
  })

  it('captures the result envelope', () => {
    const env = { type: 'result', subtype: 'success', result: '{}', num_turns: 3 }
    expect(classifyStreamLine(env).resultEnvelope).toEqual(env)
  })

  it('ignores noise frames and non-objects', () => {
    expect(classifyStreamLine({ type: 'rate_limit_event' })).toEqual({})
    expect(classifyStreamLine({ type: 'system', subtype: 'hook_started' })).toEqual({})
    expect(classifyStreamLine(null)).toEqual({})
    expect(classifyStreamLine('boom')).toEqual({})
  })
})

describe('toolLabel', () => {
  it('maps known MCP read tools', () => {
    expect(toolLabel('mcp__datapeek__explain_query')).toBe('Explaining query…')
    expect(toolLabel('mcp__datapeek__list_schemas')).toBe('Reading schema…')
  })
  it('returns undefined for unknown / internal tools', () => {
    expect(toolLabel('mcp__datapeek__something_else')).toBeUndefined()
    expect(toolLabel('StructuredOutput')).toBeUndefined()
  })
})
