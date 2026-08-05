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
