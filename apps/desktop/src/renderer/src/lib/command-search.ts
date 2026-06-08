/**
 * Search and ranking helpers for the command palette. Extracted from
 * command-palette.tsx so the scoring logic can be unit-tested without importing
 * the React component (and its cmdk / store dependencies).
 */

// Calculate fuzzy match score with bonuses for consecutive matches and word boundaries
export function calculateFuzzyScore(text: string, search: string): number {
  let textIndex = 0
  let searchIndex = 0
  let score = 0
  let consecutiveBonus = 0
  let lastMatchIndex = -2 // Start at -2 so first match doesn't get consecutive bonus
  const matchPositions: number[] = []

  while (textIndex < text.length && searchIndex < search.length) {
    if (text[textIndex] === search[searchIndex]) {
      matchPositions.push(textIndex)

      // Bonus for consecutive characters (e.g., "feed" in "feedback")
      if (textIndex === lastMatchIndex + 1) {
        consecutiveBonus += 0.05
      }

      // Bonus for matching at word boundaries (start of word)
      if (
        textIndex === 0 ||
        text[textIndex - 1] === ' ' ||
        text[textIndex - 1] === '-' ||
        text[textIndex - 1] === '_'
      ) {
        score += 0.03
      }

      lastMatchIndex = textIndex
      searchIndex++
    }
    textIndex++
  }

  // Did we match all search characters?
  if (searchIndex !== search.length) return 0

  // Base score for matching all characters
  const baseScore = 0.6

  // Bonus for shorter text (more relevant match)
  const lengthBonus = Math.max(0, 0.1 - (text.length - search.length) * 0.005)

  // Bonus for matches being close together
  const spread =
    matchPositions.length > 1 ? matchPositions[matchPositions.length - 1] - matchPositions[0] : 0
  const compactnessBonus = Math.max(0, 0.1 - spread * 0.01)

  return Math.min(0.7, baseScore + consecutiveBonus + lengthBonus + compactnessBonus + score)
}

// Custom fuzzy filter for cmdk with smart scoring
export function fuzzyFilter(value: string, search: string, keywords?: string[]): number {
  if (!search) return 1

  const searchLower = search.toLowerCase()
  const valueLower = value.toLowerCase()

  // Combine value with keywords for searching
  const keywordsLower = keywords?.map((k) => k.toLowerCase()).join(' ') || ''
  const searchableText = `${valueLower} ${keywordsLower}`

  // Exact match - highest priority
  if (valueLower === searchLower) return 1

  // Starts with - very high priority
  if (valueLower.startsWith(searchLower)) return 0.95

  // Acronym match (e.g., "nqt" matches "New Query Tab")
  const words = value.split(/\s+/)
  const acronym = words.map((w) => w[0]?.toLowerCase() || '').join('')
  if (acronym.startsWith(searchLower)) return 0.9
  if (acronym.includes(searchLower)) return 0.85

  // Contains as substring - good match
  if (valueLower.includes(searchLower)) return 0.8
  if (keywordsLower.includes(searchLower)) return 0.75

  // Smart fuzzy match with scoring based on character proximity
  const fuzzyScore = calculateFuzzyScore(searchableText, searchLower)
  if (fuzzyScore > 0) return fuzzyScore

  return 0
}

// Get query type from SQL
export function getQueryType(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  if (trimmed.startsWith('SELECT')) return 'SELECT'
  if (trimmed.startsWith('INSERT')) return 'INSERT'
  if (trimmed.startsWith('UPDATE')) return 'UPDATE'
  if (trimmed.startsWith('DELETE')) return 'DELETE'
  if (trimmed.startsWith('CREATE')) return 'CREATE'
  if (trimmed.startsWith('ALTER')) return 'ALTER'
  if (trimmed.startsWith('DROP')) return 'DROP'
  if (trimmed.startsWith('EXPLAIN')) return 'EXPLAIN'
  return 'SQL'
}
