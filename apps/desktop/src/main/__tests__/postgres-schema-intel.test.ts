import { describe, it, expect } from 'vitest'
import type { ClientBase } from 'pg'
import { SCHEMA_INTEL_CHECKS } from '@shared/index'
import { runPostgresSchemaIntel } from '@shared/schema-intel/postgres'

type Row = Record<string, unknown>

/** A client that answers each check's query from canned rows. */
function fakeClient(rows: Row[]): { client: ClientBase; asked: string[] } {
  const asked: string[] = []
  const client = {
    query: async (sql: string) => {
      asked.push(sql)
      return { rows }
    }
  }
  return { client: client as unknown as ClientBase, asked }
}

function table(name: string): Row {
  return { schema: 'public', table: name, estimated_rows: 10, total_size_bytes: 1024 }
}

describe('Postgres tables_without_pk', () => {
  it('is offered on Postgres connections', () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'tables_without_pk')
    expect(check?.supportedDbTypes).toContain('postgresql')
  })

  it('suggests a primary key as a comment block', async () => {
    const { client } = fakeClient([table('audit')])

    const report = await runPostgresSchemaIntel(client, ['tables_without_pk'])

    expect(report.skipped).toEqual([])
    expect(report.findings[0].suggestedSql).toBe(
      '-- Review and pick a unique column before running:\n-- ALTER TABLE "public"."audit" ADD COLUMN id BIGSERIAL PRIMARY KEY;'
    )
  })

  it('keeps a line break in a table name from ending the comment', async () => {
    const { client } = fakeClient([table('audit\nDROP TABLE users;--')])

    const report = await runPostgresSchemaIntel(client, ['tables_without_pk'])

    // The injected statement must not become executable SQL in the suggestion.
    const suggested = report.findings[0].suggestedSql ?? ''
    expect(suggested.split('\n').every((line) => line.startsWith('-- '))).toBe(true)
  })

  it('cannot be escaped by a quote in a table name either', async () => {
    // Quoting doubles the quote but does nothing about a line break.
    const { client } = fakeClient([table('a"\nb')])

    const report = await runPostgresSchemaIntel(client, ['tables_without_pk'])

    const suggested = report.findings[0].suggestedSql ?? ''
    expect(suggested.split('\n').every((line) => line.startsWith('-- '))).toBe(true)
  })
})
