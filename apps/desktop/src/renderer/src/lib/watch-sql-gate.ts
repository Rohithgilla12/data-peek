/**
 * Watch Mode SQL gate.
 *
 * Refuses to watch anything that could mutate state. Polling at 1s on an
 * `UPDATE ... WHERE id = 1` would relentlessly hammer that row; polling
 * `DROP TABLE` is its own kind of catastrophe.
 *
 * Rules:
 * - Exactly one statement (after stripping comments + trailing semicolons).
 * - First non-comment token must be `SELECT` or `WITH` (CTE-led SELECT).
 * - Multi-statement input is rejected with `multi_statement`, even if every
 *   statement is a SELECT — Watch Mode polls a single result shape.
 *
 * The check is dialect-agnostic because we only look at the leading keyword
 * and statement count. A more thorough analysis would walk into the CTE body
 * to ensure no `INSERT INTO ... RETURNING` masquerades inside a `WITH` — but
 * that's overkill for the gate; if a user really wants to watch a mutating
 * CTE we'll let it fail at execution time instead.
 */

export type WatchGateResult =
  | { ok: true; leadingKeyword: 'SELECT' | 'WITH' }
  | {
      ok: false
      reason:
        | 'empty'
        | 'multi_statement'
        | 'destructive_statement'
        | 'ddl_statement'
        | 'transaction_statement'
        | 'unrecognized'
      detail?: string
    }

const DESTRUCTIVE = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'UPSERT',
  'REPLACE',
  'COPY',
  'TRUNCATE'
])
const DDL = new Set([
  'CREATE',
  'DROP',
  'ALTER',
  'RENAME',
  'COMMENT',
  'GRANT',
  'REVOKE',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
  'REFRESH',
  'CLUSTER'
])
const TRANSACTION = new Set([
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'START',
  'END',
  'LOCK',
  'SET'
])

/**
 * Strip line + block comments and outer whitespace, then split on top-level
 * semicolons. Returns the non-empty statements.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  const n = sql.length
  let inSingle = false
  let inDouble = false
  let inDollar = false
  let dollarTag = ''
  let inLine = false
  let blockDepth = 0

  while (i < n) {
    const c = sql[i]
    const nx = sql[i + 1]

    if (inLine) {
      if (c === '\n') {
        inLine = false
        buf += '\n'
      }
      i++
      continue
    }
    if (blockDepth > 0) {
      if (c === '*' && nx === '/') {
        blockDepth--
        i += 2
        continue
      }
      if (c === '/' && nx === '*') {
        blockDepth++
        i += 2
        continue
      }
      i++
      continue
    }
    if (inDollar) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag
        i += dollarTag.length
        inDollar = false
        continue
      }
      buf += c
      i++
      continue
    }
    if (inSingle) {
      buf += c
      if (c === "'" && sql[i - 1] !== '\\') {
        if (nx === "'") {
          buf += nx
          i += 2
          continue
        }
        inSingle = false
      }
      i++
      continue
    }
    if (inDouble) {
      buf += c
      if (c === '"') inDouble = false
      i++
      continue
    }

    // Comments
    if (c === '-' && nx === '-') {
      inLine = true
      i += 2
      continue
    }
    if (c === '/' && nx === '*') {
      blockDepth = 1
      i += 2
      continue
    }

    // Dollar-quoted string (Postgres). $tag$ ... $tag$
    if (c === '$') {
      // Try to read a tag up to the next $.
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++
      if (sql[j] === '$') {
        dollarTag = sql.slice(i, j + 1)
        inDollar = true
        buf += dollarTag
        i = j + 1
        continue
      }
    }

    if (c === "'") {
      inSingle = true
      buf += c
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      buf += c
      i++
      continue
    }

    if (c === ';') {
      const trimmed = buf.trim()
      if (trimmed) out.push(trimmed)
      buf = ''
      i++
      continue
    }

    buf += c
    i++
  }

  const trimmed = buf.trim()
  if (trimmed) out.push(trimmed)
  return out
}

/** First identifier-shaped word, uppercased. */
function leadingKeyword(stmt: string): string {
  const m = stmt.match(/[A-Za-z_][A-Za-z0-9_]*/)
  return m ? m[0].toUpperCase() : ''
}

/**
 * Walk a single statement and return every identifier-shaped token,
 * uppercased, that appears outside string literals and comments. Used for
 * the CTE-body scan: a top-level `WITH` says "this is a CTE-led SELECT"
 * but doesn't preclude `WITH x AS (DELETE FROM ... RETURNING ...) SELECT *`,
 * which would re-fire the mutation every tick.
 *
 * Mirrors splitStatements' string/comment handling exactly so a token like
 * INSERT inside a string literal (e.g. `SELECT 'INSERT' as msg`) doesn't
 * trigger a false positive.
 */
function extractKeywordTokens(stmt: string): Set<string> {
  const tokens = new Set<string>()
  let i = 0
  const n = stmt.length
  let inSingle = false
  let inDouble = false
  let inDollar = false
  let dollarTag = ''
  let inLine = false
  let blockDepth = 0

  while (i < n) {
    const c = stmt[i]
    const nx = stmt[i + 1]

    if (inLine) {
      if (c === '\n') inLine = false
      i++
      continue
    }
    if (blockDepth > 0) {
      if (c === '*' && nx === '/') {
        blockDepth--
        i += 2
        continue
      }
      if (c === '/' && nx === '*') {
        blockDepth++
        i += 2
        continue
      }
      i++
      continue
    }
    if (inDollar) {
      if (stmt.startsWith(dollarTag, i)) {
        i += dollarTag.length
        inDollar = false
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      if (c === "'" && stmt[i - 1] !== '\\') {
        if (nx === "'") {
          i += 2
          continue
        }
        inSingle = false
      }
      i++
      continue
    }
    if (inDouble) {
      if (c === '"') inDouble = false
      i++
      continue
    }

    if (c === '-' && nx === '-') {
      inLine = true
      i += 2
      continue
    }
    if (c === '/' && nx === '*') {
      blockDepth = 1
      i += 2
      continue
    }

    if (c === '$') {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(stmt[j])) j++
      if (stmt[j] === '$') {
        dollarTag = stmt.slice(i, j + 1)
        inDollar = true
        i = j + 1
        continue
      }
    }

    if (c === "'") {
      inSingle = true
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      i++
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(stmt[j])) j++
      tokens.add(stmt.slice(i, j).toUpperCase())
      i = j
      continue
    }
    i++
  }

  return tokens
}

export function gateForWatch(sql: string): WatchGateResult {
  const statements = splitStatements(sql ?? '')

  if (statements.length === 0) {
    return { ok: false, reason: 'empty' }
  }
  if (statements.length > 1) {
    return {
      ok: false,
      reason: 'multi_statement',
      detail: `Watch Mode polls a single SELECT — found ${statements.length} statements.`
    }
  }

  const stmt = statements[0]
  const kw = leadingKeyword(stmt)

  if (kw === 'WITH') {
    // CTE-led SELECT is row-producing on its surface, but PG (and MSSQL via
    // CHANGES/DELETED) allow mutating CTEs: `WITH x AS (DELETE FROM ...
    // RETURNING ...) SELECT * FROM x`. The wrapping SELECT looks innocent —
    // the side effect runs every tick. Walk the body, look for mutating
    // keywords outside strings/comments, refuse if any are present.
    const bodyTokens = extractKeywordTokens(stmt)
    for (const bad of DESTRUCTIVE) {
      if (bodyTokens.has(bad)) {
        return {
          ok: false,
          reason: 'destructive_statement',
          detail: `Watch Mode refuses mutating CTEs (found ${bad} inside WITH).`
        }
      }
    }
    for (const bad of DDL) {
      if (bodyTokens.has(bad)) {
        return {
          ok: false,
          reason: 'ddl_statement',
          detail: `Watch Mode refuses DDL inside CTEs (found ${bad} inside WITH).`
        }
      }
    }
    return { ok: true, leadingKeyword: 'WITH' }
  }
  if (kw === 'SELECT' || kw === 'TABLE' || kw === 'VALUES') {
    // SELECT and the postgres-friendly `TABLE foo` / `VALUES (..)` shorthand
    // are all row-producing. We surface them as SELECT for the UI.
    return { ok: true, leadingKeyword: 'SELECT' }
  }
  if (DESTRUCTIVE.has(kw)) {
    return {
      ok: false,
      reason: 'destructive_statement',
      detail: `Watch Mode refuses to poll ${kw} — it would repeat the mutation every tick.`
    }
  }
  if (DDL.has(kw)) {
    return {
      ok: false,
      reason: 'ddl_statement',
      detail: `Watch Mode refuses to poll ${kw} — DDL is a one-shot operation.`
    }
  }
  if (TRANSACTION.has(kw)) {
    return {
      ok: false,
      reason: 'transaction_statement',
      detail: `Watch Mode refuses to poll ${kw} — transaction control isn't pollable.`
    }
  }
  return {
    ok: false,
    reason: 'unrecognized',
    detail: `Only SELECT statements can be watched. Got leading keyword: ${kw || '(empty)'}.`
  }
}
