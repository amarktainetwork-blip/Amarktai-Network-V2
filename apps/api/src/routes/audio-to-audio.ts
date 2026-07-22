/**
 * Audio-to-Audio Routes — isolated API routes for audio transformation operations.
 *
 * These routes are structured for later integration into the main server.
 * They use existing authentication and grant-loading helpers without
 * changing their central implementation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  createAudioToAudioDomainService,
  createFixtureAudioToAudioProviderAdapter,
  type AudioToAudioResult,
} from '@amarktai/core/audio-to-audio-contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  appSlug?: string
  grant?: Record<string, unknown>
}

// ── Route Registration ────────────────────────────────────────────────────────

export function registerAudioToAudioRoutes(app: FastifyInstance): void {
  const domainService = createAudioToAudioDomainService(createFixtureAudioToAudioProviderAdapter())

  // Submit audio-to-audio operation
  app.post('/api/v1/audio-to-audio', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error,
          code: 'VALIDATION_FAILED',
          issues: validation.issues,
        })
      }

      const a2aRequest = validation.data!

      // In a real implementation, we would:
      // 1. Load the source audio artifact
      // 2. Execute the audio-to-audio operation
      // For now, return a mock response

      const result: AudioToAudioResult = {
        status: 'accepted',
        audioToAudioId: crypto.randomUUID(),
        sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
        operation: a2aRequest.operation,
        provider: 'fixture',
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
          operation: a2aRequest.operation,
        },
        createdAt: new Date().toISOString(),
      }

      return reply.status(202).send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get audio-to-audio status
  app.get('/api/v1/audio-to-audio/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load from database
      // For now, return a mock status
      const result: AudioToAudioResult = {
        status: 'completed',
        audioToAudioId: id,
        sourceAudioArtifactId: 'mock-source-id',
        operation: 'normalize',
        provider: 'fixture',
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
          operation: 'normalize',
        },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }

      return reply.send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get audio-to-audio evidence
  app.get('/api/v1/audio-to-audio/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load evidence from database
      // For now, return mock evidence
      return reply.send({
        audioToAudioId: id,
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
          operation: 'normalize',
          providerSelected: 'fixture',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
