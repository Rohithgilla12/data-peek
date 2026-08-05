import { describe, it, expect } from 'vitest'
import { toolLabel } from '../tool-labels'

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
