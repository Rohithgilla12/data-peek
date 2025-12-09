import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteAdapter } from '../adapters/sqlite-adapter'
import type { ConnectionConfig } from '@data-peek/shared'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Test fixtures
const createTestConfig = (dbPath: string): ConnectionConfig => ({
  id: 'test-connection',
  name: 'Test SQLite',
  host: '',
  port: 0,
  database: dbPath,
  dbType: 'sqlite',
  dstPort: 0
})

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter
  let testDbPath: string
  let testConfig: ConnectionConfig

  beforeEach(() => {
    adapter = new SQLiteAdapter()
    // Create a temporary database file
    testDbPath = path.join(os.tmpdir(), `test-sqlite-${Date.now()}.db`)
    testConfig = createTestConfig(testDbPath)

    // Initialize test database with sample data
    const db = new Database(testDbPath)
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_orders_user ON orders(user_id);
      CREATE INDEX idx_orders_status ON orders(status);

      CREATE VIEW active_users AS
        SELECT * FROM users WHERE active = 1;

      INSERT INTO users (name, email, age) VALUES
        ('Alice', 'alice@example.com', 30),
        ('Bob', 'bob@example.com', 25),
        ('Charlie', 'charlie@example.com', 35);

      INSERT INTO orders (user_id, total, status) VALUES
        (1, 99.99, 'completed'),
        (1, 49.99, 'pending'),
        (2, 149.99, 'completed');
    `)
    db.close()
  })

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  })

  describe('dbType', () => {
    it('should return sqlite as dbType', () => {
      expect(adapter.dbType).toBe('sqlite')
    })
  })

  describe('connect', () => {
    it('should connect successfully to a valid database file', async () => {
      await expect(adapter.connect(testConfig)).resolves.not.toThrow()
    })

    it('should connect successfully to in-memory database', async () => {
      const memConfig = createTestConfig(':memory:')
      await expect(adapter.connect(memConfig)).resolves.not.toThrow()
    })

    it('should throw error for invalid database path', async () => {
      const invalidConfig = createTestConfig('/invalid/path/that/does/not/exist.db')
      await expect(adapter.connect(invalidConfig)).rejects.toThrow()
    })
  })

  describe('query', () => {
    it('should execute SELECT query and return results', async () => {
      const result = await adapter.query(testConfig, 'SELECT * FROM users ORDER BY id')

      expect(result.rows).toHaveLength(3)
      expect(result.fields).toContainEqual(
        expect.objectContaining({ name: 'id', dataType: 'integer' })
      )
      expect(result.fields).toContainEqual(
        expect.objectContaining({ name: 'name', dataType: 'text' })
      )
      expect(result.rowCount).toBe(3)
    })

    it('should return correct data types', async () => {
      const result = await adapter.query(
        testConfig,
        'SELECT id, name, age, active FROM users WHERE id = 1'
      )

      expect(result.rows[0]).toEqual({
        id: 1,
        name: 'Alice',
        age: 30,
        active: 1
      })
    })

    it('should handle NULL values', async () => {
      // Insert a row with NULL age
      const db = new Database(testDbPath)
      db.exec("INSERT INTO users (name, email) VALUES ('NoAge', 'noage@test.com')")
      db.close()

      const result = await adapter.query(testConfig, "SELECT age FROM users WHERE name = 'NoAge'")

      expect(result.rows[0].age).toBeNull()
    })

    it('should handle aggregate functions', async () => {
      const result = await adapter.query(testConfig, 'SELECT COUNT(*) as count FROM users')

      expect(result.rows[0].count).toBe(3)
    })

    it('should handle JOINs', async () => {
      const result = await adapter.query(
        testConfig,
        `SELECT u.name, o.total
         FROM users u
         JOIN orders o ON u.id = o.user_id
         ORDER BY o.total DESC`
      )

      expect(result.rows).toHaveLength(3)
      expect(result.rows[0].total).toBe(149.99)
    })
  })

  describe('queryMultiple', () => {
    it('should execute multiple statements', async () => {
      const result = await adapter.queryMultiple(
        testConfig,
        'SELECT COUNT(*) as count FROM users; SELECT COUNT(*) as count FROM orders'
      )

      expect(result.results).toHaveLength(2)
      expect(result.results[0].rows[0].count).toBe(3)
      expect(result.results[1].rows[0].count).toBe(3)
    })

    it('should track statement index correctly', async () => {
      const result = await adapter.queryMultiple(
        testConfig,
        'SELECT 1 as a; SELECT 2 as b; SELECT 3 as c'
      )

      expect(result.results[0].statementIndex).toBe(0)
      expect(result.results[1].statementIndex).toBe(1)
      expect(result.results[2].statementIndex).toBe(2)
    })

    it('should identify data-returning statements', async () => {
      const result = await adapter.queryMultiple(
        testConfig,
        "SELECT 1; INSERT INTO users (name, email) VALUES ('Test', 'test@test.com')"
      )

      expect(result.results[0].isDataReturning).toBe(true)
      expect(result.results[1].isDataReturning).toBe(false)
    })

    it('should handle INSERT with RETURNING', async () => {
      const result = await adapter.queryMultiple(
        testConfig,
        "INSERT INTO users (name, email) VALUES ('Return', 'return@test.com') RETURNING *"
      )

      expect(result.results[0].isDataReturning).toBe(true)
      expect(result.results[0].rows).toHaveLength(1)
      expect(result.results[0].rows[0].name).toBe('Return')
    })

    it('should report total duration', async () => {
      const result = await adapter.queryMultiple(testConfig, 'SELECT 1; SELECT 2')

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
    })

    it('should stop on error and include partial results', async () => {
      await expect(
        adapter.queryMultiple(testConfig, 'SELECT 1; SELECT * FROM nonexistent_table; SELECT 3')
      ).rejects.toThrow('Error in statement 2')
    })
  })

  describe('execute', () => {
    it('should execute INSERT and return row count', async () => {
      const result = await adapter.execute(
        testConfig,
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['NewUser', 'new@test.com']
      )

      expect(result.rowCount).toBe(1)
    })

    it('should execute UPDATE and return affected rows', async () => {
      const result = await adapter.execute(
        testConfig,
        'UPDATE users SET age = ? WHERE age > ?',
        [40, 25]
      )

      expect(result.rowCount).toBe(2) // Alice (30) and Charlie (35)
    })

    it('should execute DELETE and return affected rows', async () => {
      const result = await adapter.execute(testConfig, 'DELETE FROM orders WHERE status = ?', [
        'pending'
      ])

      expect(result.rowCount).toBe(1)
    })

    it('should handle parameterized queries with NULL', async () => {
      const result = await adapter.execute(
        testConfig,
        'INSERT INTO users (name, email, age) VALUES (?, ?, ?)',
        ['NullAge', 'nullage@test.com', null]
      )

      expect(result.rowCount).toBe(1)
    })
  })

  describe('executeTransaction', () => {
    it('should execute multiple statements in a transaction', async () => {
      const result = await adapter.executeTransaction(testConfig, [
        {
          sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
          params: ['User1', 'user1@test.com']
        },
        {
          sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
          params: ['User2', 'user2@test.com']
        }
      ])

      expect(result.rowsAffected).toBe(2)
      expect(result.results).toHaveLength(2)
      expect(result.results[0].rowCount).toBe(1)
      expect(result.results[1].rowCount).toBe(1)

      // Verify data was inserted
      const query = await adapter.query(testConfig, 'SELECT COUNT(*) as count FROM users')
      expect(query.rows[0].count).toBe(5) // 3 original + 2 new
    })

    it('should rollback transaction on error', async () => {
      // Get initial count
      const beforeQuery = await adapter.query(testConfig, 'SELECT COUNT(*) as count FROM users')
      const beforeCount = beforeQuery.rows[0].count

      // Try to execute transaction with invalid second statement
      await expect(
        adapter.executeTransaction(testConfig, [
          {
            sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
            params: ['User1', 'user1@test.com']
          },
          { sql: 'INSERT INTO nonexistent_table VALUES (?)', params: ['invalid'] }
        ])
      ).rejects.toThrow()

      // Verify count is unchanged (rollback occurred)
      const afterQuery = await adapter.query(testConfig, 'SELECT COUNT(*) as count FROM users')
      expect(afterQuery.rows[0].count).toBe(beforeCount)
    })

    it('should handle empty transaction', async () => {
      const result = await adapter.executeTransaction(testConfig, [])

      expect(result.rowsAffected).toBe(0)
      expect(result.results).toEqual([])
    })
  })

  describe('getSchemas', () => {
    it('should return main schema with tables and views', async () => {
      const schemas = await adapter.getSchemas(testConfig)

      expect(schemas).toHaveLength(1)
      expect(schemas[0].name).toBe('main')
      expect(schemas[0].routines).toEqual([])
    })

    it('should list all tables', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const tables = schemas[0].tables.filter((t) => t.type === 'table')

      expect(tables.map((t) => t.name).sort()).toEqual(['orders', 'users'])
    })

    it('should list views', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const views = schemas[0].tables.filter((t) => t.type === 'view')

      expect(views).toHaveLength(1)
      expect(views[0].name).toBe('active_users')
    })

    it('should include column metadata', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const usersTable = schemas[0].tables.find((t) => t.name === 'users')

      expect(usersTable).toBeDefined()
      expect(usersTable!.columns).toContainEqual(
        expect.objectContaining({
          name: 'id',
          dataType: 'integer',
          isPrimaryKey: true,
          isNullable: false
        })
      )
      expect(usersTable!.columns).toContainEqual(
        expect.objectContaining({
          name: 'name',
          dataType: 'text',
          isPrimaryKey: false,
          isNullable: false
        })
      )
      expect(usersTable!.columns).toContainEqual(
        expect.objectContaining({
          name: 'age',
          isNullable: true
        })
      )
    })

    it('should include foreign key metadata', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const ordersTable = schemas[0].tables.find((t) => t.name === 'orders')

      expect(ordersTable).toBeDefined()
      const userIdCol = ordersTable!.columns.find((c) => c.name === 'user_id')

      expect(userIdCol).toBeDefined()
      expect(userIdCol!.foreignKey).toEqual({
        constraintName: 'fk_orders_user_id',
        referencedSchema: 'main',
        referencedTable: 'users',
        referencedColumn: 'id'
      })
    })

    it('should include default values', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const usersTable = schemas[0].tables.find((t) => t.name === 'users')
      const activeCol = usersTable!.columns.find((c) => c.name === 'active')

      expect(activeCol!.defaultValue).toBe('1')
    })

    it('should exclude sqlite system tables', async () => {
      const schemas = await adapter.getSchemas(testConfig)
      const tableNames = schemas[0].tables.map((t) => t.name)

      expect(tableNames).not.toContain('sqlite_sequence')
      expect(tableNames).not.toContain('sqlite_master')
    })
  })

  describe('explain', () => {
    it('should return query plan', async () => {
      const result = await adapter.explain(testConfig, 'SELECT * FROM users WHERE id = 1', false)

      expect(result.plan).toBeDefined()
      expect(Array.isArray(result.plan)).toBe(true)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should include detail in plan', async () => {
      const result = await adapter.explain(testConfig, 'SELECT * FROM users WHERE id = 1', false)

      const plan = result.plan as Array<{ id: number; parent: number; detail: string }>
      expect(plan.length).toBeGreaterThan(0)
      expect(plan[0]).toHaveProperty('detail')
    })

    it('should handle JOIN queries', async () => {
      const result = await adapter.explain(
        testConfig,
        `SELECT u.name, o.total
         FROM users u
         JOIN orders o ON u.id = o.user_id`,
        false
      )

      expect(result.plan).toBeDefined()
    })
  })

  describe('getTableDDL', () => {
    it('should return table definition with columns', async () => {
      const definition = await adapter.getTableDDL(testConfig, 'main', 'users')

      expect(definition.schema).toBe('main')
      expect(definition.name).toBe('users')
      expect(definition.columns).toHaveLength(6)
    })

    it('should include column details', async () => {
      const definition = await adapter.getTableDDL(testConfig, 'main', 'users')

      const idCol = definition.columns.find((c) => c.name === 'id')
      expect(idCol).toMatchObject({
        name: 'id',
        dataType: 'integer',
        isPrimaryKey: true,
        isNullable: false
      })
    })

    it('should include foreign key constraints', async () => {
      const definition = await adapter.getTableDDL(testConfig, 'main', 'orders')

      expect(definition.constraints).toHaveLength(1)
      expect(definition.constraints[0]).toMatchObject({
        type: 'foreign_key',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id']
      })
    })

    it('should include non-automatic indexes', async () => {
      const definition = await adapter.getTableDDL(testConfig, 'main', 'orders')

      // Should have user and status indexes (not the auto pk/unique ones)
      const indexNames = definition.indexes.map((i) => i.name)
      expect(indexNames).toContain('idx_orders_user')
      expect(indexNames).toContain('idx_orders_status')
    })

    it('should mark unique columns', async () => {
      const definition = await adapter.getTableDDL(testConfig, 'main', 'users')

      const emailCol = definition.columns.find((c) => c.name === 'email')
      expect(emailCol?.isUnique).toBe(true)
    })
  })

  describe('getSequences', () => {
    it('should return empty array (SQLite has no sequences)', async () => {
      const sequences = await adapter.getSequences(testConfig)

      expect(sequences).toEqual([])
    })
  })

  describe('getTypes', () => {
    it('should return empty array (SQLite has no custom types)', async () => {
      const types = await adapter.getTypes(testConfig)

      expect(types).toEqual([])
    })
  })

  describe('type normalization', () => {
    it('should normalize INTEGER types', async () => {
      const db = new Database(testDbPath)
      db.exec(`
        CREATE TABLE type_test (
          a INTEGER,
          b INT,
          c TINYINT,
          d SMALLINT,
          e MEDIUMINT,
          f BIGINT,
          g INT2,
          h INT8
        )
      `)
      db.close()

      const schemas = await adapter.getSchemas(testConfig)
      const typeTest = schemas[0].tables.find((t) => t.name === 'type_test')

      for (const col of typeTest!.columns) {
        expect(col.dataType).toBe('integer')
      }
    })

    it('should normalize TEXT types', async () => {
      const db = new Database(testDbPath)
      db.exec(`
        CREATE TABLE text_test (
          a TEXT,
          b CHARACTER(20),
          c VARCHAR(255),
          d VARYING CHARACTER(100),
          e NCHAR(55),
          f NATIVE CHARACTER(70),
          g NVARCHAR(100),
          h CLOB
        )
      `)
      db.close()

      const schemas = await adapter.getSchemas(testConfig)
      const textTest = schemas[0].tables.find((t) => t.name === 'text_test')

      for (const col of textTest!.columns) {
        expect(col.dataType).toBe('text')
      }
    })

    it('should normalize REAL types', async () => {
      const db = new Database(testDbPath)
      db.exec(`
        CREATE TABLE real_test (
          a REAL,
          b DOUBLE,
          c DOUBLE PRECISION,
          d FLOAT
        )
      `)
      db.close()

      const schemas = await adapter.getSchemas(testConfig)
      const realTest = schemas[0].tables.find((t) => t.name === 'real_test')

      for (const col of realTest!.columns) {
        expect(col.dataType).toBe('real')
      }
    })

    it('should normalize BLOB type', async () => {
      const db = new Database(testDbPath)
      db.exec('CREATE TABLE blob_test (a BLOB, b NONE)')
      db.close()

      const schemas = await adapter.getSchemas(testConfig)
      const blobTest = schemas[0].tables.find((t) => t.name === 'blob_test')

      expect(blobTest!.columns[0].dataType).toBe('blob')
      expect(blobTest!.columns[1].dataType).toBe('blob')
    })

    it('should preserve date/time types', async () => {
      const db = new Database(testDbPath)
      db.exec('CREATE TABLE date_test (a DATE, b DATETIME, c TIMESTAMP)')
      db.close()

      const schemas = await adapter.getSchemas(testConfig)
      const dateTest = schemas[0].tables.find((t) => t.name === 'date_test')

      expect(dateTest!.columns.find((c) => c.name === 'a')!.dataType).toBe('date')
      expect(dateTest!.columns.find((c) => c.name === 'b')!.dataType).toBe('datetime')
      expect(dateTest!.columns.find((c) => c.name === 'c')!.dataType).toBe('timestamp')
    })
  })

  describe('error handling', () => {
    it('should throw on invalid SQL syntax', async () => {
      await expect(adapter.query(testConfig, 'SELEC * FORM users')).rejects.toThrow()
    })

    it('should throw on missing table', async () => {
      await expect(adapter.query(testConfig, 'SELECT * FROM nonexistent')).rejects.toThrow()
    })

    it('should throw on constraint violation', async () => {
      await expect(
        adapter.execute(
          testConfig,
          'INSERT INTO users (name, email) VALUES (?, ?)',
          ['Duplicate', 'alice@example.com'] // email already exists
        )
      ).rejects.toThrow()
    })
  })
})
