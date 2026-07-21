import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@amarktai/core/marketing-platform', replacement: fromRoot('./packages/core/src/marketing-platform.ts') },
      { find: '@amarktai/core/social-ad-video', replacement: fromRoot('./packages/core/src/social-ad-video.ts') },
      { find: '@amarktai/core', replacement: fromRoot('./packages/core/src/index.ts') },
      { find: '@amarktai/db', replacement: fromRoot('./packages/db/src/index.ts') },
      { find: '@amarktai/providers', replacement: fromRoot('./packages/providers/src/index.ts') },
      { find: '@amarktai/artifacts', replacement: fromRoot('./packages/artifacts/src/index.ts') },
    ],
  },
  test: {
    setupFiles: ['./tests/setup-unit-environment.ts'],
    exclude: ['tests/browser/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
