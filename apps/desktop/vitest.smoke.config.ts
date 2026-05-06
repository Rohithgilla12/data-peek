import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/pool-smoke.test.ts'],
    testTimeout: 60_000
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../../packages/shared/src'),
      '@data-peek/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  }
})
