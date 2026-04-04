'use client'

import { useQueryState } from 'nuqs'
import { searchParams } from '@/lib/search-params'

export function useConnectionParam() {
  return useQueryState('connection', searchParams.connection)
}

export function useSidebarTab() {
  return useQueryState('sidebar', searchParams.sidebar)
}

export function useSqlParam() {
  return useQueryState('sql', searchParams.sql)
}

export function useSchemaSearchParam() {
  return useQueryState('schemaSearch', searchParams.schemaSearch)
}

export function useShowFiltersParam() {
  return useQueryState('showFilters', searchParams.showFilters)
}

export function usePageParam() {
  return useQueryState('page', searchParams.page)
}
