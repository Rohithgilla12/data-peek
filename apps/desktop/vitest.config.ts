import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/main/sql-builder.ts',
        'src/main/ddl-builder.ts',
        'src/main/sql-utils.ts',
        'src/renderer/src/stores/**/*.ts'
      ],
      exclude: ['**/node_modules/**', '**/__tests__/**']
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../../packages/shared/src'),
      '@data-peek/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  }
})
