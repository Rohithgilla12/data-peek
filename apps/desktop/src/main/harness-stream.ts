/**
 * Streaming helpers for the BYOH harness — Pure Module.
 *
 * `claude -p --output-format stream-json --include-partial-messages` emits NDJSON:
 * one JSON object per line. This module turns those lines into the two things the
 * chat UI needs — the assistant's prose as it streams, and a live label for each
 * grounding/tool step — without any Electron / process imports, so it unit-tests
 * in plain node.
 */

/** A single classified NDJSON line. Any field may be absent. */
export interface StreamLineInfo {
  /** Incremental assistant text (from a content_block_delta / text_delta). */
  textDelta?: string
  /** Human label for a tool the assistant just invoked (grounding step). */
  toolLabel?: string
  /** The terminal `result` envelope, carrying the model's final reply + stats. */
  resultEnvelope?: Record<string, unknown>
}

const TOOL_LABELS: Record<string, string> = {
  run_query: 'Running query…',
  explain_query: 'Explaining query…',
  list_schemas: 'Reading schema…'
}

/** Friendly label for an MCP tool id like `mcp__datapeek__run_query`. */
export function toolLabel(name: string): string {
  const short = name.split('__').pop() || name
  return TOOL_LABELS[short] ?? `Using ${short}…`
}

/**
 * Classify one parsed NDJSON line from the CLI's stream-json output. Only the
 * frames we care about produce a non-empty result; everything else (rate_limit,
 * hook_*, status, message_start/stop, user tool-results) is ignored.
 */
export function classifyStreamLine(obj: unknown): StreamLineInfo {
  const info: StreamLineInfo = {}
  if (!obj || typeof obj !== 'object') return info
  const line = obj as Record<string, unknown>

  if (line.type === 'stream_event') {
    const event = line.event as
      { type?: string; delta?: { type?: string; text?: unknown } } | undefined
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      info.textDelta = String(event.delta.text ?? '')
    }
    return info
  }

  if (line.type === 'assistant') {
    const message = line.message as { content?: unknown } | undefined
    const content = message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object') {
          const b = block as { type?: string; name?: unknown }
          if (b.type === 'tool_use' && typeof b.name === 'string') {
            info.toolLabel = toolLabel(b.name)
            break
          }
        }
      }
    }
    return info
  }

  if (line.type === 'result') {
    info.resultEnvelope = line
    return info
  }

  return info
}

/**
 * Extract the current (possibly partial) value of the top-level "message" field
 * from an in-progress JSON string. The model streams its structured reply
 * character by character, so once it starts writing `"message": "…"` we can
 * surface that prose live — before the JSON is complete. Returns the decoded
 * string so far, or '' when the field hasn't started yet.
 *
 * Handles JSON escapes and stops cleanly at an incomplete escape/unicode run so
 * a half-streamed value never throws.
 */
export function extractPartialMessage(raw: string): string {
  const keyIndex = raw.indexOf('"message"')
  if (keyIndex === -1) return ''

  let i = raw.indexOf(':', keyIndex + '"message"'.length)
  if (i === -1) return ''
  i++
  while (i < raw.length && /\s/.test(raw[i])) i++
  if (raw[i] !== '"') return ''
  i++ // past the opening quote

  let out = ''
  while (i < raw.length) {
    const c = raw[i]
    if (c === '\\') {
      const next = raw[i + 1]
      if (next === undefined) return out // incomplete escape — stop, don't throw
      switch (next) {
        case 'n':
          out += '\n'
          break
        case 't':
          out += '\t'
          break
        case 'r':
          out += '\r'
          break
        case 'b':
          out += '\b'
          break
        case 'f':
          out += '\f'
          break
        case '"':
          out += '"'
          break
        case '\\':
          out += '\\'
          break
        case '/':
          out += '/'
          break
        case 'u': {
          const hex = raw.slice(i + 2, i + 6)
          if (hex.length < 4) return out // incomplete unicode escape — stop
          out += String.fromCharCode(parseInt(hex, 16))
          i += 4
          break
        }
        default:
          out += next
      }
      i += 2
      continue
    }
    if (c === '"') return out // closing quote — string complete
    out += c
    i++
  }
  return out // string not yet closed — return what streamed so far
}
