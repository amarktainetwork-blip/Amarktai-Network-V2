/**
 * Live Groq chat proof — unmocked, calls real Groq API.
 *
 * This file does NOT mock @amarktai/providers or groqChat.
 * It only runs when RUN_LIVE_GROQ_TESTS=true AND GROQ_API_KEY is present.
 *
 * This proves the provider client makes a real API call and gets real output.
 * It does NOT prove the full DB worker lifecycle (that is covered by unit tests).
 */

import { describe, expect, it } from 'vitest'

const shouldRun =
  process.env.RUN_LIVE_GROQ_TESTS === 'true' && !!process.env.GROQ_API_KEY

describe.skipIf(!shouldRun)('Live Groq chat proof (unmocked)', () => {
  it('calls real Groq API and returns non-empty text', async () => {
    // Import the real provider executor (unmocked)
    const { executeWithProvider } = await import('../apps/worker/src/providers/provider-executor.ts')

    const result = await executeWithProvider({
      jobId: 'live-proof-001',
      appSlug: 'proof-app',
      capability: 'chat',
      prompt: 'Reply with exactly: AMARKTAI_GROQ_LIVE_OK',
      input: {},
      metadata: {},
      traceId: 'trace-live-proof',
    })

    // Proves real Groq API call succeeded
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.provider).toBe('groq')
    expect(result.output).toBeTruthy()
    expect(result.output.length).toBeGreaterThan(0)
    expect(result.model).toBeTruthy()

    // Never expose API key
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(process.env.GROQ_API_KEY)
  })
})

describe.skipIf(shouldRun)('Live Groq proof skipped', () => {
  it('skips because RUN_LIVE_GROQ_TESTS or GROQ_API_KEY missing', () => {
    // This test documents that live proof was skipped
    console.log('[live-proof] Skipped: RUN_LIVE_GROQ_TESTS and/or GROQ_API_KEY not set')
    expect(true).toBe(true)
  })
})
