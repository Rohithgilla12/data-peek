import { describe, expect, it } from 'vitest'
import { classifyInput } from '../ask-input'

describe('classifyInput', () => {
  it.each([
    'select * from users',
    'SELECT id, email FROM users WHERE id = 1',
    'select 1',
    'select now()',
    '  with recent as (select 1) select * from recent',
    '(select 1) union all (select 2)',
    'show tables',
    'show search_path',
    'describe users',
    'explain analyze select * from orders',
    "insert into users (email) values ('a@b.c')",
    "update users set name = 'x' where id = 1",
    'delete from sessions where expired',
    'create table t (id int)',
    'create unique index on users (email)',
    'alter table users add column age int',
    'drop view if exists v',
    'truncate events',
    'grant select on users to readonly',
    'begin',
    '-- a comment\nselect 1',
    '/* hi */ select 1',
    'values (1), (2)',
    'table users',
    'pragma table_info(users)',
    '\\dt'
  ])('treats %j as SQL', (text) => {
    expect(classifyInput(text)).toBe('sql')
  })

  it.each([
    'how many users signed up last week?',
    'show me the 10 newest organizations',
    'show revenue by plan',
    'select all users created last week',
    'describe how invoices relate to subscriptions',
    'explain why this query is slow',
    'create a chart of signups per day',
    'delete inactive users',
    'update me on churn',
    'drop off rate by plan',
    'which tables have no primary key',
    'what is in the events table',
    'top customers by revenue',
    'table of active users with their orgs'
  ])('treats %j as a question', (text) => {
    expect(classifyInput(text)).toBe('ask')
  })

  it('returns null for blank input so the caller keeps its current mode', () => {
    expect(classifyInput('   ')).toBeNull()
  })

  it('ignores question words inside string literals', () => {
    expect(classifyInput("select * from users where name = 'who are you?'")).toBe('sql')
  })
})
