import { describe, it, expect } from 'vitest'
import type { TableInfo, ColumnInfo } from '@shared/index'

describe('TableInfo Type', () => {
  describe('Table Types', () => {
    it('should allow table type', () => {
      const table: TableInfo = {
        name: 'users',
        type: 'table',
        columns: []
      }
      expect(table.type).toBe('table')
    })

    it('should allow view type', () => {
      const view: TableInfo = {
        name: 'active_users',
        type: 'view',
        columns: []
      }
      expect(view.type).toBe('view')
    })

    it('should allow materialized_view type', () => {
      const matView: TableInfo = {
        name: 'user_stats',
        type: 'materialized_view',
        columns: []
      }
      expect(matView.type).toBe('materialized_view')
    })
  })

  describe('TableInfo with Columns', () => {
    it('should support columns for materialized views', () => {
      const columns: ColumnInfo[] = [
        {
          name: 'id',
          dataType: 'int4',
          isNullable: false,
          isPrimaryKey: false,
          ordinalPosition: 1
        },
        {
          name: 'count',
          dataType: 'int8',
          isNullable: true,
          isPrimaryKey: false,
          ordinalPosition: 2
        }
      ]

      const matView: TableInfo = {
        name: 'aggregated_stats',
        type: 'materialized_view',
        columns
      }

      expect(matView.columns).toHaveLength(2)
      expect(matView.columns[0].name).toBe('id')
      expect(matView.columns[1].name).toBe('count')
    })

    it('should support estimatedRowCount for all table types', () => {
      const table: TableInfo = {
        name: 'users',
        type: 'table',
        columns: [],
        estimatedRowCount: 1000
      }

      const view: TableInfo = {
        name: 'active_users',
        type: 'view',
        columns: [],
        estimatedRowCount: 500
      }

      const matView: TableInfo = {
        name: 'user_stats',
        type: 'materialized_view',
        columns: [],
        estimatedRowCount: 100
      }

      expect(table.estimatedRowCount).toBe(1000)
      expect(view.estimatedRowCount).toBe(500)
      expect(matView.estimatedRowCount).toBe(100)
    })
  })

  describe('Type Validation', () => {
    it('should distinguish between table types correctly', () => {
      const tables: TableInfo[] = [
        { name: 't1', type: 'table', columns: [] },
        { name: 't2', type: 'view', columns: [] },
        { name: 't3', type: 'materialized_view', columns: [] },
        { name: 't4', type: 'table', columns: [] },
        { name: 't5', type: 'materialized_view', columns: [] }
      ]

      const regularTables = tables.filter((t) => t.type === 'table')
      const views = tables.filter((t) => t.type === 'view')
      const materializedViews = tables.filter((t) => t.type === 'materialized_view')

      expect(regularTables).toHaveLength(2)
      expect(views).toHaveLength(1)
      expect(materializedViews).toHaveLength(2)
    })
  })
})
