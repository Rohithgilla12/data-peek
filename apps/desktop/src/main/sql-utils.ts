/**
 * Shared SQL utility functions
 */

/**
 * Quote an identifier according to the dialect's rules
 * @param name - The identifier name to quote
 * @param identifierQuote - The quote character for the dialect ('"', '`', or '[')
 * @returns The quoted identifier
 */
export function quoteIdentifier(name: string, identifierQuote: string): string {
  // MSSQL uses square brackets [ and ]
  if (identifierQuote === '[') {
    // Escape ] by doubling it
    const escaped = name.replace(/\]/g, ']]')
    return `[${escaped}]`
  }
  // For other dialects, escape quote character by doubling it
  const escaped = name.replace(new RegExp(identifierQuote, 'g'), identifierQuote + identifierQuote)
  return `${identifierQuote}${escaped}${identifierQuote}`
}
