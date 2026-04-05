import { format } from 'sql-formatter'

export interface FormatOptions {
  language?: 'sql' | 'postgresql' | 'mysql' | 'sqlite'
  tabWidth?: number
  useTabs?: boolean
  keywordCase?: 'upper' | 'lower' | 'preserve'
  linesBetweenQueries?: number
}

const defaultOptions: FormatOptions = {
  language: 'postgresql',
  tabWidth: 2,
  useTabs: false,
  keywordCase: 'upper',
  linesBetweenQueries: 2,
}

export function formatSQL(query: string, options: FormatOptions = {}): string {
  const mergedOptions = { ...defaultOptions, ...options }

  try {
    return format(query, {
      language: mergedOptions.language,
      tabWidth: mergedOptions.tabWidth,
      useTabs: mergedOptions.useTabs,
      keywordCase: mergedOptions.keywordCase,
      linesBetweenQueries: mergedOptions.linesBetweenQueries,
    })
  } catch {
    return query
  }
}
