/**
 * Returns a Tailwind text color class based on SQL data type
 */
export function getTypeColor(type: string): string {
  const lower = type.toLowerCase()
  if (lower.includes('uuid')) return 'text-cat-purple'
  if (lower.includes('varchar') || lower.includes('text') || lower.includes('char'))
    return 'text-cat-green'
  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('bigint')
  )
    return 'text-cat-blue'
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time'))
    return 'text-cat-orange'
  if (lower.includes('bool')) return 'text-cat-yellow'
  return 'text-muted-foreground'
}
