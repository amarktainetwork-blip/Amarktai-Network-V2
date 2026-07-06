/**
 * Live Together image proof - unmocked, calls real Together API when enabled.
 *
 * This file does not mock @amarktai/providers or togetherGenerateImage.
 * It only runs when RUN_LIVE_TOGETHER_TESTS=true and TOGETHER_API_KEY is present.
 */

import { describe, expect, it } from 'vitest'

const shouldRun =
  process.env.RUN_LIVE_TOGETHER_TESTS === 'true' && !!process.env.TOGETHER_API_KEY

describe.skipIf(!shouldRun)('Live Together image proof (unmocked)', () => {
  it('calls real Together image API and returns a non-empty image buffer', async () => {
    const { togetherGenerateImage } = await import('../packages/providers/src/index.ts')

    const result = await togetherGenerateImage({
      prompt: 'A simple blue circle on a white background, minimal icon style',
      width: 512,
      height: 512,
      steps: 4,
      n: 1,
    })

    expect(result.model).toBeTruthy()
    expect(result.images.length).toBeGreaterThan(0)
    expect(result.images[0].buffer.length).toBeGreaterThan(0)
    expect(result.images[0].mimeType).toMatch(/^image\//)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(process.env.TOGETHER_API_KEY)
  })
})

describe.skipIf(shouldRun)('Live Together proof skipped', () => {
  it('skips because RUN_LIVE_TOGETHER_TESTS or TOGETHER_API_KEY missing', () => {
    console.log('[live-proof] Skipped: RUN_LIVE_TOGETHER_TESTS and/or TOGETHER_API_KEY not set. Set TOGETHER_IMAGE_MODEL to a serverless-accessible image model before running live proof.')
    expect(true).toBe(true)
  })
})
