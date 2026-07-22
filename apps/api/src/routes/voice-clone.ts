/**
 * Voice Clone Routes — isolated API routes for voice clone operations.
 *
 * These routes are structured for later integration into the main server.
 * They use existing authentication and grant-loading helpers without
 * changing their central implementation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  createVoiceCloneDomainService,
  createFixtureVoiceCloneProviderAdapter,
  type VoiceCloneResult,
} from '@amarktai/core/voice-clone-contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  appSlug?: string
  grant?: Record<string, unknown>
}

// ── Route Registration ────────────────────────────────────────────────────────

export function registerVoiceCloneRoutes(app: FastifyInstance): void {
  const domainService = createVoiceCloneDomainService(createFixtureVoiceCloneProviderAdapter())

  // Submit voice clone
  app.post('/api/v1/voice-clone', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

      const cloneRequest = validation.data!

      // In a real implementation, we would:
      // 1. Load the voice profile from the database
      // 2. Load the source audio artifact
      // 3. Execute the clone operation
      // For now, return a mock response

      const result: VoiceCloneResult = {
        status: 'accepted',
        voiceCloneId: crypto.randomUUID(),
        voiceProfileId: cloneRequest.voiceProfileId,
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

  // Get voice clone status
  app.get('/api/v1/voice-clone/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load from database
      // For now, return a mock status
      const result: VoiceCloneResult = {
        status: 'completed',
        voiceCloneId: id,
        voiceProfileId: 'mock-profile-id',
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

  // Cancel voice clone
  app.post('/api/v1/voice-clone/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        voiceCloneId: id,
        message: 'Voice clone operation cancelled',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice clone evidence
  app.get('/api/v1/voice-clone/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const appSlug = request.appSlug
      if (!appSlug) {
        return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      }

      const { id } = request.params as { id: string }

      // In a real implementation, we would load evidence from database
      // For now, return mock evidence
      return reply.send({
        voiceCloneId: id,
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
