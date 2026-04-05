import {
  parseAsString,
  parseAsStringLiteral,
  parseAsBoolean,
  parseAsInteger,
} from 'nuqs'

export const sidebarTabs = ['schema', 'saved', 'history'] as const

export const searchParams = {
  connection: parseAsString,
  sidebar: parseAsStringLiteral(sidebarTabs).withDefault('schema'),
  sql: parseAsString.withDefault(''),
  tab: parseAsString,
  schemaSearch: parseAsString.withDefault(''),
  showFilters: parseAsBoolean.withDefault(false),
  page: parseAsInteger.withDefault(0),
}
