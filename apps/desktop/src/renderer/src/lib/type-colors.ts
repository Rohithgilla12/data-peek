/**
 * Returns a Tailwind text color class based on SQL data type
 */
export function getTypeColor(type: string): string {
  const lower = type.toLowerCase()
  if (lower.includes('uuid')) return 'text-purple-400'
  if (lower.includes('varchar') || lower.includes('text') || lower.includes('char'))
    return 'text-green-400'
  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('bigint')
  )
    return 'text-blue-400'
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time'))
    return 'text-orange-400'
  if (lower.includes('bool')) return 'text-yellow-400'
  return 'text-muted-foreground'
}
