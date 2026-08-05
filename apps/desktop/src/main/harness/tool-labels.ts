const TOOL_LABELS: Record<string, string> = {
  run_query: 'Running query…',
  explain_query: 'Explaining query…',
  list_schemas: 'Reading schema…'
}

/**
 * Friendly label for one of our MCP read tools (e.g. `mcp__datapeek__run_query`).
 * Returns undefined for anything else — including the CLI's internal
 * `StructuredOutput` tool used to enforce --json-schema, which is an output
 * mechanism, not a grounding step, and shouldn't show as activity.
 */
export function toolLabel(name: string): string | undefined {
  const short = name.split('__').pop() || name
  return TOOL_LABELS[short]
}
