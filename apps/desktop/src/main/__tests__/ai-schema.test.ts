import { describe, it, expect } from 'vitest'
import { responseSchema, RESPONSE_JSON_SCHEMA, RESPONSE_JSON_SCHEMA_STRING } from '../ai-schema'

describe('RESPONSE_JSON_SCHEMA', () => {
  it('covers exactly the same fields as the zod responseSchema (drift guard)', () => {
    const zodKeys = Object.keys(responseSchema.shape).sort()
    const jsonKeys = Object.keys(RESPONSE_JSON_SCHEMA.properties).sort()
    expect(jsonKeys).toEqual(zodKeys)
  })

  it('requires only type + message (the rest are optional/nullable)', () => {
    expect([...RESPONSE_JSON_SCHEMA.required].sort()).toEqual(['message', 'type'])
  })

  it('serializes to valid JSON for the --json-schema flag', () => {
    expect(() => JSON.parse(RESPONSE_JSON_SCHEMA_STRING)).not.toThrow()
    expect(JSON.parse(RESPONSE_JSON_SCHEMA_STRING)).toEqual(RESPONSE_JSON_SCHEMA)
  })

  it('accepts a minimal valid object shape through the zod schema', () => {
    // structured_output the CLI would return for a plain message
    const parsed = responseSchema.safeParse({ type: 'message', message: 'hi' })
    expect(parsed.success).toBe(true)
  })
})
