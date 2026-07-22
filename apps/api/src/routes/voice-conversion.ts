/**
 * Voice Conversion Routes — isolated API routes for voice conversion operations.
 *
 * These routes are structured for later integration into the main server.
 * They use existing authentication and grant-loading helpers without
 * changing their central implementation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  createVoiceConversionDomainService,
  createFixtureVoiceConversionProviderAdapter,
  type VoiceConversionResult,
} from '@amarktai/core/voice-conversion-contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  appSlug?: string
  grant?: Record<string, unknown>
}

// ── Route Registration ────────────────────────────────────────────────────────

export function registerVoiceConversionRoutes(app: FastifyInstance): void {
  const domainService = createVoiceConversionDomainService(createFixtureVoiceConversionProviderAdapter())

  // Submit voice conversion
  app.post('/api/v1/voice-conversion', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

      const conversionRequest = validation.data!

      // In a real implementation, we would:
      // 1. Load the target voice profile from the database
      // 2. Load the source audio artifact
      // 3. Execute the conversion operation
      // For now, return a mock response

      const result: VoiceConversionResult = {
        status: 'accepted',
        voiceConversionId: crypto.randomUUID(),
        sourceAudioArtifactId: conversionRequest.sourceAudioArtifactId,
        targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
        provider: 'fixture',
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
        },
        createdAt: new Date().toISOString(),
      }

      return reply.status(202).send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice conversion status
  app.get('/api/v1/voice-conversion/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load from database
      // For now, return a mock status
      const result: VoiceConversionResult = {
        status: 'completed',
        voiceConversionId: id,
        sourceAudioArtifactId: 'mock-source-id',
        targetVoiceProfileId: 'mock-target-id',
        provider: 'fixture',
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
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

  // Cancel voice conversion
  app.post('/api/v1/voice-conversion/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would cancel the operation
      // For now, return a mock response
      return reply.send({
        status: 'cancelled',
        voiceConversionId: id,
        message: 'Voice conversion operation cancelled',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice conversion evidence
  app.get('/api/v1/voice-conversion/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load evidence from database
      // For now, return mock evidence
      return reply.send({
        voiceConversionId: id,
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
          providerSelected: 'fixture',
          sanitizedProviderRef: `fixture_resource_${id}`,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
