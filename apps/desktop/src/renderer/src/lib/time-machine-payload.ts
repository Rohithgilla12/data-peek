/**
 * Time Machine payload helpers — pure functions, no store imports.
 *
 * Snapshot values are normalized ONCE here, before they cross IPC. pg hands the
 * renderer live Date objects (timestamptz) and Uint8Arrays (bytea); persisting
 * those through JSON would make a rehydrated snapshot disagree with a fresh one
 * on every timestamp cell. Normalizing at capture means both sides of any
 * snapshot-vs-snapshot diff went through the same serialization.
 */

import { MASKED_PLACEHOLDER } from './export'

const BINARY_PREVIEW_BYTES = 256

export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'bigint') return value.toString()
  // JSON.stringify would silently turn these into null, conflating them with
  // SQL NULL in the stored snapshot and the content hash.
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  if (value instanceof Uint8Array) {
    let hex = ''
    const previewLength = Math.min(value.length, BINARY_PREVIEW_BYTES)
    for (let i = 0; i < previewLength; i++) {
      hex += value[i].toString(16).padStart(2, '0')
    }
    const suffix = value.length > BINARY_PREVIEW_BYTES ? `… (${value.length} bytes)` : ''
    return `\\x${hex}${suffix}`
  }
  return value
}

/**
 * Convert result rows to the columnar payload shape (column names stored once,
 * values as arrays), redacting masked columns so sensitive values never reach
 * disk. Mirrors the '[MASKED]' substitution used by exports.
 */
export function toColumnarRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  columnNames: ReadonlyArray<string>,
  maskedColumns: ReadonlySet<string>
): unknown[][] {
  return rows.map((row) =>
    columnNames.map((name) =>
      maskedColumns.has(name) ? MASKED_PLACEHOLDER : normalizeValue(row[name])
    )
  )
}

/** Inverse of toColumnarRows — rebuild Record rows for the grid and the differ. */
export function recordsFromColumnar(
  columns: ReadonlyArray<{ name: string; dataType: string }>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): Record<string, unknown>[] {
  return rows.map((values) => {
    const record: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i++) {
      record[columns[i].name] = values[i]
    }
    return record
  })
}
