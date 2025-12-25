import { describe, it, expect } from 'vitest'
import type { SchemaInfo, TableInfo } from '@data-peek/shared'

// Test the schema filtering logic used in schema-explorer.tsx
describe('Schema Explorer Filtering', () => {
  // Helper to filter tables based on type and search - mirrors the logic in schema-explorer.tsx
  const filterTables = (
    tables: TableInfo[],
    options: {
      showTables: boolean
      showViews: boolean
      showMaterializedViews: boolean
      searchQuery: string
    }
  ): TableInfo[] => {
    const query = options.searchQuery.toLowerCase().trim()

    return tables.filter((table) => {
      // Type filter
      if (table.type === 'table' && !options.showTables) return false
      if (table.type === 'view' && !options.showViews) return false
      if (table.type === 'materialized_view' && !options.showMaterializedViews) return false
      // Search filter
      if (query && !table.name.toLowerCase().includes(query)) return false
      return true
    })
  }

  const createTestSchema = (): SchemaInfo => ({
    name: 'public',
    tables: [
      { name: 'users', type: 'table', columns: [] },
      { name: 'orders', type: 'table', columns: [] },
      { name: 'active_users', type: 'view', columns: [] },
      { name: 'user_orders', type: 'view', columns: [] },
      { name: 'user_stats', type: 'materialized_view', columns: [] },
      { name: 'order_summary', type: 'materialized_view', columns: [] }
    ]
  })

  describe('Type Filtering', () => {
    it('should show all types when all filters are enabled', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(6)
    })

    it('should hide tables when showTables is false', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: false,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(4)
      expect(filtered.every((t) => t.type !== 'table')).toBe(true)
    })

    it('should hide views when showViews is false', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: false,
        showMaterializedViews: true,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(4)
      expect(filtered.every((t) => t.type !== 'view')).toBe(true)
    })

    it('should hide materialized views when showMaterializedViews is false', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: false,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(4)
      expect(filtered.every((t) => t.type !== 'materialized_view')).toBe(true)
    })

    it('should show only tables when only showTables is true', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: false,
        showMaterializedViews: false,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(2)
      expect(filtered.every((t) => t.type === 'table')).toBe(true)
    })

    it('should show only materialized views when only showMaterializedViews is true', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: false,
        showViews: false,
        showMaterializedViews: true,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(2)
      expect(filtered.every((t) => t.type === 'materialized_view')).toBe(true)
    })

    it('should return empty when all filters are false', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: false,
        showViews: false,
        showMaterializedViews: false,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(0)
    })
  })

  describe('Search Filtering', () => {
    it('should filter by search query', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: 'user'
      })

      expect(filtered).toHaveLength(4)
      expect(filtered.every((t) => t.name.toLowerCase().includes('user'))).toBe(true)
    })

    it('should be case insensitive', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: 'USER'
      })

      expect(filtered).toHaveLength(4)
    })

    it('should handle whitespace in search query', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: '  user  '
      })

      expect(filtered).toHaveLength(4)
    })

    it('should combine search with type filters', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: false,
        showViews: false,
        showMaterializedViews: true,
        searchQuery: 'user'
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('user_stats')
      expect(filtered[0].type).toBe('materialized_view')
    })
  })

  describe('Empty Cases', () => {
    it('should handle empty tables array', () => {
      const filtered = filterTables([], {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: ''
      })

      expect(filtered).toHaveLength(0)
    })

    it('should return no matches for non-matching search', () => {
      const schema = createTestSchema()
      const filtered = filterTables(schema.tables, {
        showTables: true,
        showViews: true,
        showMaterializedViews: true,
        searchQuery: 'nonexistent'
      })

      expect(filtered).toHaveLength(0)
    })
  })
})
