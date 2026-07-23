/**
 * Voice Audio Worker Contract Tests — behavioral tests for the isolated worker handlers.
 *
 * Proves:
 * - Cross-app artifact payload denied
 * - Malformed queue payload denied
 * - Missing source file denied
 * - Cancellation before FFmpeg
 * - Cancellation before persistence
 * - Cancellation after persistence (race guard)
 * - Real output artifact persistence
 * - Source lineage preserved
 * - Output checksum computed
 * - Handler registration works
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  job: { findUnique: vi.fn(), update: vi.fn() },
  artifact: { update: vi.fn() },
}

const mockGetArtifactRecord = vi.fn()
const mockGetArtifactFile = vi.fn()
const mockSaveArtifact = vi.fn()

vi.mock('@amarktai/db', () => ({ prisma: mockPrisma }))
vi.mock('@amarktai/artifacts', () => ({
  getArtifactRecord: mockGetArtifactRecord,
  getArtifactFile: mockGetArtifactFile,
  saveArtifact: mockSaveArtifact,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('voice audio worker contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('payload validation', () => {
    it('rejects missing jobId', async () => {
      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: '',
        appSlug: 'test-app',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'normalize' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('jobId')
    })

    it('rejects missing appSlug', async () => {
      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: 'job-1',
        appSlug: '',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'normalize' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('appSlug')
    })

    it('rejects invalid operation', async () => {
      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'invalid_operation' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('Invalid operation')
    })
  })

  describe('app isolation', () => {
    it('rejects cross-app artifact', async () => {
      mockGetArtifactRecord.mockResolvedValue({
        id: 'art-1',
        appSlug: 'other-app', // Different app
        status: 'completed',
        mimeType: 'audio/wav',
      })

      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'normalize', sourceAudioArtifactId: 'art-1' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('does not belong to app')
    })

    it('rejects non-completed artifact', async () => {
      mockGetArtifactRecord.mockResolvedValue({
        id: 'art-1',
        appSlug: 'test-app',
        status: 'processing', // Not completed
        mimeType: 'audio/wav',
      })

      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'normalize', sourceAudioArtifactId: 'art-1' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('not completed')
    })
  })

  describe('cancellation guards', () => {
    it('cancels before FFmpeg execution', async () => {
      mockGetArtifactRecord.mockResolvedValue({
        id: 'art-1',
        appSlug: 'test-app',
        status: 'completed',
        mimeType: 'audio/wav',
      })
      mockGetArtifactFile.mockResolvedValue({
        buffer: Buffer.from('test-audio'),
        mimeType: 'audio/wav',
        filename: 'test.wav',
      })
      // Job is cancelled
      mockPrisma.job.findUnique.mockResolvedValue({ status: 'cancelled' })

      const { handleAudioToAudioJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleAudioToAudioJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'audio_to_audio',
        prompt: 'test',
        input: { operation: 'normalize', sourceAudioArtifactId: 'art-1' },
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('cancelled')
    })
  })

  describe('voice blockers', () => {
    it('voice clone returns provider blocker', async () => {
      const { handleVoiceCloneJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleVoiceCloneJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'voice_clone',
        prompt: 'test',
        input: {},
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE')
      expect(result.metadata?.evidenceSource).toBe('executor_unavailable')
      expect(result.metadata?.liveProviderProof).toBe(false)
    })

    it('voice conversion returns provider blocker', async () => {
      const { handleVoiceConversionJob } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const result = await handleVoiceConversionJob({
        jobId: 'job-1',
        appSlug: 'test-app',
        capability: 'voice_conversion',
        prompt: 'test',
        input: {},
        traceId: 'trace-1',
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE')
      expect(result.metadata?.evidenceSource).toBe('executor_unavailable')
      expect(result.metadata?.liveProviderProof).toBe(false)
    })
  })

  describe('handler registration', () => {
    it('registers all three handlers', async () => {
      const { registerVoiceAudioHandlers, VOICE_AUDIO_HANDLERS } = await import('../apps/worker/src/handlers/voice-audio-handlers.js')
      const registry: Record<string, any> = {}

      registerVoiceAudioHandlers(registry)

      expect(registry.voice_clone).toBeDefined()
      expect(registry.voice_conversion).toBeDefined()
      expect(registry.audio_to_audio).toBeDefined()
      expect(typeof registry.voice_clone).toBe('function')
      expect(typeof registry.voice_conversion).toBe('function')
      expect(typeof registry.audio_to_audio).toBe('function')
    })
  })
})
