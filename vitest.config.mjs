import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@amarktai/core/marketing-platform': fromRoot('./packages/core/src/marketing-platform.ts'),
      '@amarktai/core/social-ad-video': fromRoot('./packages/core/src/social-ad-video.ts'),
      '@amarktai/core/rag-platform': fromRoot('./packages/core/src/rag-platform.ts'),
      '@amarktai/core/research-platform': fromRoot('./packages/core/src/research-platform.ts'),
      '@amarktai/core/voice-avatar-platform': fromRoot('./packages/core/src/voice-avatar-platform.ts'),
      '@amarktai/core/voice-avatar-resources': fromRoot('./packages/core/src/voice-avatar-resources.ts'),
      '@amarktai/core/voice-avatar-evidence': fromRoot('./packages/core/src/voice-avatar-evidence.ts'),
      '@amarktai/core/governed-tts': fromRoot('./packages/core/src/governed-tts.ts'),
      '@amarktai/core/source-audio-validation': fromRoot('./packages/core/src/source-audio-validation.ts'),
      '@amarktai/core/voice-clone-contracts': fromRoot('./packages/core/src/voice-clone-contracts.ts'),
      '@amarktai/core/voice-conversion-contracts': fromRoot('./packages/core/src/voice-conversion-contracts.ts'),
      '@amarktai/core/audio-to-audio-contracts': fromRoot('./packages/core/src/audio-to-audio-contracts.ts'),
      '@amarktai/core/voice-activity-detection-contracts': fromRoot('./packages/core/src/voice-activity-detection-contracts.ts'),
      '@amarktai/core/storyboard-subtitle-contracts': fromRoot('./packages/core/src/storyboard-subtitle-contracts.ts'),
      '@amarktai/core/config': fromRoot('./packages/core/src/config.ts'),
      '@amarktai/core': fromRoot('./packages/core/src/index.ts'),
      '@amarktai/db': fromRoot('./packages/db/src/index.ts'),
      '@amarktai/providers': fromRoot('./packages/providers/src/index.ts'),
      '@amarktai/artifacts': fromRoot('./packages/artifacts/src/index.ts'),
    },
  },
  test: {
    setupFiles: ['./tests/setup-unit-environment.ts'],
    exclude: ['tests/browser/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
