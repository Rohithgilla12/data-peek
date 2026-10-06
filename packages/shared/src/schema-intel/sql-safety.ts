/**
 * Helpers that keep catalog-derived identifiers from changing the meaning of
 * the SQL a Schema Intel check suggests.
 *
 * Two shapes of bug come from interpolating a name into a string:
 *
 * 1. A name that reaches a `--` line comment can carry a line break, which
 *    ends the comment and turns the rest of the "commented out" statement into
 *    live SQL.
 * 2. A name that is aggregated into a comma-joined list is indistinguishable
 *    from two names when it contains the delimiter.
 *
 * Both are hardening rather than live bugs: identifiers almost never contain
 * these characters. They are still worth closing, because the payload is a
 * name read from the user's own database.
 */

/**
 * Separator used when a query has to aggregate names into a single column.
 *
 * MySQL's `GROUP_CONCAT` defaults to `,`, and a delimited identifier such as
 * `` `region,code` `` is legal, so the default cannot be used to reconstruct
 * the list. `0x1F` (unit separator) is the conventional choice: a backticked
 * identifier may technically hold it, but no tooling produces such a name.
 *
 * Every aggregation that feeds {@link parseAggList} must pass this as its
 * `SEPARATOR`.
 */
export const AGG_SEPARATOR = "\u001f";

/**
 * Splits a {@link AGG_SEPARATOR}-joined payload back into names.
 *
 * Pass `keepEmpty: true` for payloads that use an empty entry as a
 * positional placeholder (for example a column list that has to stay aligned
 * with an index's key order). The default drops empty entries, which is what
 * a plain list of names wants.
 */
export function parseAggList(raw: unknown, keepEmpty = false): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  const parts = raw.split(AGG_SEPARATOR);
  return keepEmpty ? parts : parts.filter(Boolean);
}

/**
 * Renders lines as a `--` comment block, prefixing every physical line.
 *
 * Splitting the lines before prefixing is the point: an interpolated name may
 * itself contain CR/LF, and prefixing only the logical line would leave the
 * remainder of that name as executable SQL. Quoting does not help here —
 * `[a\nb]` and `` `a\nb` `` and `"a\nb"` all still end the comment.
 */
export function commentedSql(lines: string[]): string {
  return lines
    .flatMap((line) => line.split(/\r\n|\r|\n/))
    .map((line) => `-- ${line}`)
    .join("\n");
}
