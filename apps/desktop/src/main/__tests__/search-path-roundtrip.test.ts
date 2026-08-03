import { describe, it, expect } from 'vitest'
import { buildSearchPathOption, parseSchemaList } from '../adapters/pg-client-config'
// Relative, not the `@/` alias: that alias is declared only in tsconfig.web.json, and this
// file sits under src/main/**, which tsconfig.node.json owns — `@/lib/...` fails
// typecheck:node with TS2307 even though vitest resolves it happily. The test lives on the
// main side because pulling main's pg-client-config (which imports `fs`) into the web
// project would be the worse of the two boundary crossings.
import { parseConnectionString } from '../../renderer/src/lib/connection-string-parser'

/**
 * Guards the inverse relationship between the two halves of default-schema handling:
 *
 *   buildSearchPathOption  (main)     schema field -> libpq `options` startup parameter
 *   parseConnectionString  (renderer) pasted URL   -> schema field
 *
 * They live in different modules and are otherwise only tested against hand-written
 * expected strings, so an edit to one can silently drift from the other while every
 * per-module test still passes. Three escaping bugs shipped into review because nothing
 * checked the two ends against each other — each produced a valid-looking but wrong
 * search_path rather than an error.
 */

/** Round-trip a field value out through the URL form and back. */
function throughUrl(schema: string): { options: string; parsed: string | undefined } {
  const options = buildSearchPathOption(schema)
  if (!options) throw new Error(`expected options for ${JSON.stringify(schema)}`)
  const url = `postgresql://u:p@host:5432/db?options=${encodeURIComponent(options)}`
  return { options, parsed: parseConnectionString(url, 'postgresql')?.schema }
}

// Deliberately adversarial: each fragment targets a different layer of the escaping.
// Commas are excluded — see the documented limitation at the bottom of this file.
const FRAGMENTS = [
  'bbl', // the ordinary case
  'public',
  'UPPER', // mixed case needs the quoting to survive
  'user', // reserved word
  'my schema', // space -> backslash-escaped for pg_split_opts
  'we"ird', // quote -> doubled inside the identifier
  'back\\slash', // backslash -> escaped for pg_split_opts
  'both "and" spaced', // space and quote interacting, which broke a candidate fix
  'trailing\\', // backslash at the very end
  '"quoted"', // a value pasted straight out of SHOW search_path
  'schema-with-dash'
]

describe('search_path round-trip: build -> URL -> parse', () => {
  it.each(FRAGMENTS)('preserves the single schema %j', (name) => {
    const { parsed } = throughUrl(name)
    expect(parseSchemaList(parsed)).toEqual(parseSchemaList(name))
  })

  it('preserves every two-schema fallback chain the fragments can form', () => {
    const mismatches: string[] = []
    for (const first of FRAGMENTS) {
      for (const second of FRAGMENTS) {
        const input = `${first}, ${second}`
        const { parsed } = throughUrl(input)
        const got = parseSchemaList(parsed)
        const want = parseSchemaList(input)
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          mismatches.push(`${JSON.stringify(input)} -> ${JSON.stringify(got)}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('is stable — re-building from the parsed value reproduces the same options string', () => {
    // Guards against a round-trip that is lossy but self-consistently so, where the first
    // pass mangles the value and every later pass agrees with the mangling.
    for (const name of FRAGMENTS) {
      const { options, parsed } = throughUrl(name)
      expect(buildSearchPathOption(parsed)).toBe(options)
    }
  })

  it('round-trips the plain ?schema= form too', () => {
    for (const name of FRAGMENTS) {
      const url = `postgresql://u:p@host:5432/db?schema=${encodeURIComponent(name)}`
      const parsed = parseConnectionString(url, 'postgresql')?.schema
      expect(parseSchemaList(parsed)).toEqual(parseSchemaList(name))
    }
  })
})

describe('search_path round-trip: documented limitations', () => {
  it('cannot represent a schema name containing a comma', () => {
    // The field uses commas to separate a fallback chain, so a comma inside a single
    // name is unrepresentable by construction. Asserted rather than left implicit so a
    // future reader knows this is a chosen trade-off, not an undiscovered bug.
    expect(parseSchemaList('we,ird')).toEqual(['we', 'ird'])
  })

  it('normalises a name that is wholly wrapped in quotes', () => {
    // `"bbl"` and `bbl` both mean the schema bbl — the wrapper is stripped so a psql
    // paste does not get re-quoted. A schema whose actual name includes the outer
    // quotes is therefore not addressable, which is an accepted trade.
    expect(parseSchemaList('"bbl"')).toEqual(['bbl'])
  })
})
