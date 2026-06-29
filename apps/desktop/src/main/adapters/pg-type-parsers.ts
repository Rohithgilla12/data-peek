import { types } from 'pg'

/**
 * Return Postgres date/time values as the raw string the database sent, rather
 * than letting node-postgres reinterpret them through a JS `Date`.
 *
 * By default `pg` parses `timestamp without time zone` (and `date`) in the
 * Node process's local timezone, so a value stored as UTC silently gains a
 * phantom offset — and the same instant then renders differently in the grid
 * (`String(date)`, local) versus the cell inspector (`toISOString()`, UTC).
 * Showing the literal DB value removes both problems and matches what a data
 * client should do: report exactly what's stored.
 *
 * `setTypeParser` mutates the process-global pg-types registry, so this only
 * needs to run once; it is idempotent and safe to call repeatedly.
 */
export function configurePgTypeParsers(): void {
  const raw = (value: string): string => value
  types.setTypeParser(types.builtins.TIMESTAMP, raw) // 1114 — timestamp without time zone
  types.setTypeParser(types.builtins.TIMESTAMPTZ, raw) // 1184 — timestamp with time zone
  types.setTypeParser(types.builtins.DATE, raw) // 1082 — date
}
