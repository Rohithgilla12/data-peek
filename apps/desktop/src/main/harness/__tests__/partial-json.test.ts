import { describe, it, expect } from 'vitest'
import { extractPartialMessage } from '../partial-json'

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
