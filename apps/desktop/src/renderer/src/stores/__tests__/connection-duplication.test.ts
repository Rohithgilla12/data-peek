import { describe, it, expect } from 'vitest'
import type { ConnectionConfig } from '@data-peek/shared'

// Test the connection duplication logic without UI dependencies
describe('Connection Duplication', () => {
  // Helper function that mirrors the duplication logic in connection-switcher.tsx
  const duplicateConnection = (connection: ConnectionConfig): ConnectionConfig => {
    return {
      ...connection,
      id: 'new-uuid', // In real code this would be crypto.randomUUID()
      name: `${connection.name} (copy)`
    }
  }

  const createTestConnection = (overrides?: Partial<ConnectionConfig>): ConnectionConfig => ({
    id: 'test-connection-1',
    name: 'Test Connection',
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'postgres',
    password: 'secret',
    ssl: false,
    ssh: false,
    dbType: 'postgresql',
    dstPort: 5432,
    ...overrides
  })

  describe('duplicateConnection', () => {
    it('should create a new connection with a different ID', () => {
      const original = createTestConnection()
      const duplicate = duplicateConnection(original)

      expect(duplicate.id).not.toBe(original.id)
    })

    it('should append (copy) to the name', () => {
      const original = createTestConnection({ name: 'Production DB' })
      const duplicate = duplicateConnection(original)

      expect(duplicate.name).toBe('Production DB (copy)')
    })

    it('should preserve all other connection properties', () => {
      const original = createTestConnection({
        host: 'prod.example.com',
        port: 5433,
        database: 'production',
        user: 'admin',
        ssl: true
      })
      const duplicate = duplicateConnection(original)

      expect(duplicate.host).toBe(original.host)
      expect(duplicate.port).toBe(original.port)
      expect(duplicate.database).toBe(original.database)
      expect(duplicate.user).toBe(original.user)
      expect(duplicate.ssl).toBe(original.ssl)
      expect(duplicate.dbType).toBe(original.dbType)
    })

    it('should preserve SSH configuration', () => {
      const original = createTestConnection({
        ssh: true,
        sshConfig: {
          host: 'bastion.example.com',
          port: 22,
          user: 'ubuntu',
          authMethod: 'Public Key',
          privateKeyPath: '/home/user/.ssh/id_rsa'
        }
      })
      const duplicate = duplicateConnection(original)

      expect(duplicate.ssh).toBe(true)
      expect(duplicate.sshConfig).toEqual(original.sshConfig)
    })

    it('should preserve MSSQL options', () => {
      const original = createTestConnection({
        dbType: 'mssql',
        mssqlOptions: {
          encrypt: true,
          trustServerCertificate: false,
          authentication: 'SQL Server Authentication'
        }
      })
      const duplicate = duplicateConnection(original)

      expect(duplicate.mssqlOptions).toEqual(original.mssqlOptions)
    })

    it('should preserve MySQL connection properties', () => {
      const original = createTestConnection({
        dbType: 'mysql',
        port: 3306
      })
      const duplicate = duplicateConnection(original)

      expect(duplicate.dbType).toBe('mysql')
      expect(duplicate.port).toBe(3306)
    })

    it('should handle connections with no password', () => {
      const original = createTestConnection({ password: undefined })
      const duplicate = duplicateConnection(original)

      expect(duplicate.password).toBeUndefined()
    })

    it('should handle connections with no user', () => {
      const original = createTestConnection({ user: undefined })
      const duplicate = duplicateConnection(original)

      expect(duplicate.user).toBeUndefined()
    })
  })

  describe('Name Generation', () => {
    it('should handle names that already end with (copy)', () => {
      const original = createTestConnection({ name: 'Test (copy)' })
      const duplicate = duplicateConnection(original)

      // This results in "Test (copy) (copy)" which is acceptable
      expect(duplicate.name).toBe('Test (copy) (copy)')
    })

    it('should handle empty name', () => {
      const original = createTestConnection({ name: '' })
      const duplicate = duplicateConnection(original)

      expect(duplicate.name).toBe(' (copy)')
    })

    it('should handle special characters in name', () => {
      const original = createTestConnection({ name: 'DB [Prod] @AWS' })
      const duplicate = duplicateConnection(original)

      expect(duplicate.name).toBe('DB [Prod] @AWS (copy)')
    })
  })
})
