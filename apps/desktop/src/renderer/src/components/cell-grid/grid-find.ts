import { cellText } from '@/lib/selection-serialize'
import type { CellPosition } from './cell-grid-types'

export interface FindQuery {
  needle: string
  caseSensitive: boolean
  regex: boolean
}

/** A matching cell. `row` indexes the filtered and sorted rows before pagination. */
export interface GridMatch {
  row: number
  col: number
}

export type FindResult =
  { kind: 'ok'; matches: GridMatch[] } | { kind: 'invalid-regex'; message: string }

const NO_MATCHES: FindResult = { kind: 'ok', matches: [] }

/**
 * The text of every cell, row-major, with masked and empty cells as null. Built
 * once per result so a keystroke only pays for matching, not for stringifying
 * every value again.
 */
export interface FindIndex {
  colCount: number
  texts: ReadonlyArray<string | null>
  /** Lower-cased texts, built on the first case-insensitive search. */
  lowered: () => ReadonlyArray<string | null>
}

export function buildFindIndex(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<{ name: string }>,
  isMasked: (columnName: string) => boolean
): FindIndex {
  const names = columns.map((column) => (isMasked(column.name) ? null : column.name))
  const texts: (string | null)[] = new Array(rows.length * names.length)
  let i = 0
  for (const record of rows) {
    for (const name of names) texts[i++] = name === null ? null : cellText(record[name])
  }
  let lowered: (string | null)[] | null = null
  return {
    colCount: names.length,
    texts,
    lowered: () => (lowered ??= texts.map((text) => (text === null ? null : text.toLowerCase())))
  }
}

/** Every cell whose copied text matches the query, in row-major order. */
export function findMatches(index: FindIndex, query: FindQuery): FindResult {
  if (query.needle === '' || index.colCount === 0) return NO_MATCHES

  let texts = index.texts
  let test: (text: string) => boolean
  if (query.regex) {
    let pattern: RegExp
    try {
      // No `g` flag: a global regex carries lastIndex between test() calls.
      pattern = new RegExp(query.needle, query.caseSensitive ? '' : 'i')
    } catch (err) {
      return { kind: 'invalid-regex', message: err instanceof Error ? err.message : String(err) }
    }
    test = (text) => pattern.test(text)
  } else if (query.caseSensitive) {
    const needle = query.needle
    test = (text) => text.includes(needle)
  } else {
    const needle = query.needle.toLowerCase()
    texts = index.lowered()
    test = (text) => text.includes(needle)
  }

  const matches: GridMatch[] = []
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    if (text !== null && test(text)) {
      matches.push({ row: Math.floor(i / index.colCount), col: i % index.colCount })
    }
  }
  return { kind: 'ok', matches }
}

/** Where a match lives once the rows are paginated. */
export function locateMatch(
  match: GridMatch,
  pageSize: number
): { pageIndex: number; pos: CellPosition } {
  return {
    pageIndex: Math.floor(match.row / pageSize),
    pos: { row: match.row % pageSize, col: match.col }
  }
}
