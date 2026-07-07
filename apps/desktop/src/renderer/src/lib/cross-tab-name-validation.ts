/**
 * Reference-name validation for cross-tab queries.
 *
 * Three layers of rules, in order:
 *   1. Shape — pattern, length, normalization (lowercase, trim).
 *   2. Reserved words — SQL keywords that would lead to ambiguous CTEs or
 *      flag-out parsing inside the user's query.
 *   3. Uniqueness — duplicates within the same connection are rejected so
 *      `@active_users` is unambiguous.
 *
 * Validation runs both at input time (Tab → "Name this tab as @…") and at
 * parse time (the resolver double-checks before generating CTEs).
 */

import { isSQLKeyword } from '@data-peek/shared'
import {
  REF_NAME_MAX_LENGTH,
  REF_NAME_PATTERN,
  type RefNameValidationResult
} from './cross-tab-types'

/**
 * SQL keywords we refuse to allow as tab names. A name like `@select` would
 * make the resulting CTE `WITH select(...)` which parses but is awful to
 * read; worse, names like `@from` could collide visually with parser state
 * in the future autocomplete pass.
 */
const RESERVED_REF_NAMES = new Set([
  'select',
  'from',
  'where',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'natural',
  'on',
  'using',
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'fetch',
  'with',
  'as',
  'and',
  'or',
  'not',
  'null',
  'true',
  'false',
  'distinct',
  'all',
  'union',
  'intersect',
  'except',
  'case',
  'when',
  'then',
  'else',
  'end',
  'in',
  'between',
  'like',
  'ilike',
  'is',
  'exists',
  'any',
  'some',
  'values',
  'returning',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'alter',
  'truncate',
  'grant',
  'revoke',
  'begin',
  'commit',
  'rollback'
])

/**
 * Validate that the given string is a usable reference name, optionally
 * also checking for uniqueness across a set of already-taken names on the
 * same connection.
 *
 * `takenNames` should map `name → tabId`. If the candidate is in the map
 * with a tabId different from `ownTabId`, the validation fails with
 * `duplicate`. Passing the same `ownTabId` lets a tab keep its name on
 * re-validate (e.g., when the user blurs the rename input without
 * changing the value).
 */
export function validateRefName(
  candidate: string,
  options: {
    takenNames?: Map<string, string>
    ownTabId?: string
  } = {}
): RefNameValidationResult {
  // Normalize: trim + lowercase. The lowercase requirement keeps the CTE
  // generation deterministic and avoids case-mismatched identifier quoting
  // issues across PG/MySQL.
  const normalized = candidate.trim().toLowerCase()

  if (normalized.length === 0) {
    return { ok: false, error: { kind: 'empty' } }
  }
  if (normalized.length > REF_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: {
        kind: 'too_long',
        length: normalized.length,
        max: REF_NAME_MAX_LENGTH
      }
    }
  }
  if (!REF_NAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: {
        kind: 'invalid_chars',
        detail: 'Use lowercase letters, digits, underscores. Must start with a letter.'
      }
    }
  }
  if (RESERVED_REF_NAMES.has(normalized) || isSQLKeyword(normalized)) {
    // Local list catches common keywords with a clear message; the shared
    // isSQLKeyword catches the long tail (table, into, set, recursive,
    // references, using, over, etc.) that the resolver would otherwise
    // reject at run time with `unknown_reference`. Surface them here so
    // the rename UI catches the bad name on input.
    return {
      ok: false,
      error: { kind: 'reserved_word', word: normalized }
    }
  }

  const { takenNames, ownTabId } = options
  if (takenNames) {
    const conflicting = takenNames.get(normalized)
    if (conflicting && conflicting !== ownTabId) {
      return {
        ok: false,
        error: { kind: 'duplicate', conflictingTabId: conflicting }
      }
    }
  }

  return { ok: true, normalized }
}

/** Returns true iff the word is in the SQL reserved-words set. Exported for tests. */
export function isReservedRefName(word: string): boolean {
  return RESERVED_REF_NAMES.has(word.toLowerCase())
}
