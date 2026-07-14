/**
 * Cross-Tab Query References — public types.
 *
 * The feature lets a user write `SELECT … WHERE user_id IN (@active_users)`
 * in tab B, where `@active_users` is another tab's named result. At submit
 * time the resolver inlines that result as a `VALUES`-backed CTE.
 *
 * These types are the surface area between the parser, the resolver, the
 * tab store, and (eventually) the Monaco language extension. Keeping them
 * here (not in `@data-peek/shared`) since cross-tab is renderer-only — the
 * IPC contract doesn't change. If the resolver ever moves into the main
 * process for staging via temp tables we can lift these into shared.
 */

/** Reference name pattern — lowercase identifier, starts with a letter. */
export const REF_NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/** Hard length cap on a reference name. */
export const REF_NAME_MAX_LENGTH = 32

export type RefNameValidationError =
  | { kind: 'empty' }
  | { kind: 'too_long'; length: number; max: number }
  | { kind: 'invalid_chars'; detail: string }
  | { kind: 'reserved_word'; word: string }
  | { kind: 'duplicate'; conflictingTabId: string }

export type RefNameValidationResult =
  { ok: true; normalized: string } | { ok: false; error: RefNameValidationError }

/** Result of TabStore.setTabName — name-validation outcomes plus the non-query-tab precondition. */
export type SetTabNameResult =
  RefNameValidationResult | { ok: false; error: { kind: 'not_a_query_tab' } }

/**
 * A single `@name` token discovered in source SQL.
 */
export interface TabReference {
  /** The raw match, e.g. "@active_users". */
  raw: string
  /** Position in the source SQL (start inclusive, end exclusive). */
  start: number
  end: number
  /** Resolved name (without the @). */
  name: string
  /** Resolution status — set during resolve(), starts as 'unknown'. */
  status: ResolveStatus
  /** The referenced tab id, when resolved. */
  tabId?: string
}

export type ResolveStatus =
  | 'unknown' // name doesn't match any named tab
  | 'resolved' // matched a tab with a usable result
  | 'no_result' // tab exists but hasn't been run yet (or last run errored)
  | 'errored' // tab's last result was an error
  | 'circular' // resolving this reference would loop back to itself

/** Parser output — a SQL string + the refs found inside it. */
export interface ParsedSql {
  /** All references found, in source order. */
  references: TabReference[]
  /** Unique names referenced (deduplicated). */
  referencedNames: Set<string>
}

/**
 * Settings that bound how aggressive the resolver can be. The defaults match
 * the plan's recommendations; users can raise or lower them in settings.
 */
export interface ResolveCaps {
  /** Max rows per single inlined reference. Plan default: 10,000. */
  maxRowsPerRef: number
  /** Max bytes total across all inlined CTEs in one resolve. Plan default: 5MB. */
  maxBytesTotal: number
  /** Max columns per reference (sanity). Plan default: 100. */
  maxColumnsPerRef: number
}

export const DEFAULT_RESOLVE_CAPS: ResolveCaps = {
  maxRowsPerRef: 10_000,
  maxBytesTotal: 5 * 1024 * 1024,
  maxColumnsPerRef: 100
}

export type ResolveErrorKind =
  | { kind: 'unknown_reference'; name: string }
  | { kind: 'circular'; chain: string[] }
  | { kind: 'no_result'; name: string }
  | { kind: 'errored_result'; name: string; error: string }
  | {
      kind: 'too_large'
      name: string
      rows: number
      bytes: number
      cap: { rows: number; bytes: number }
    }
  | { kind: 'too_many_columns'; name: string; columns: number; cap: number }
  | { kind: 'duplicate_cte_name'; name: string }

export interface ResolveResult {
  /** SQL ready to send to the database — references substituted with CTEs. */
  finalSql: string
  /** CTEs prepended to the SQL (one per unique reference). */
  prependedCtes: string[]
  /** Total bytes added by inlining — used against maxBytesTotal. */
  bytesAdded: number
  /** Rows inlined across all references. */
  rowsInlined: number
  /** Per-reference summary, in resolution order. */
  references: Array<{ name: string; tabId: string; rows: number; bytes: number }>
}
