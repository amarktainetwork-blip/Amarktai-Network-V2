import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@amarktai/core': fromRoot('./packages/core/src/index.ts'),
      '@amarktai/db': fromRoot('./packages/db/src/index.ts'),
      '@amarktai/providers': fromRoot('./packages/providers/src/index.ts'),
      '@amarktai/artifacts': fromRoot('./packages/artifacts/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
