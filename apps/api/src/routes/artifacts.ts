/**
 * GET /api/v1/artifacts/:id/file — Secure local storage asset serving endpoint.
 *
 * Serves artifact files from the local VPS storage directory.
 * Validates that the artifact exists and is completed before serving.
 */

import type { FastifyInstance } from 'fastify'
import { getArtifactFile, getArtifactRecord } from '@amarktai/artifacts'
import { authenticateArtifactAccess, canAccessArtifact } from '../lib/auth-context.js'

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/artifacts/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string }

    const auth = await authenticateArtifactAccess(app, request.headers.authorization)
    if (!auth) {
      return reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
    }

    const artifact = await getArtifactRecord(id)
    if (!artifact) {
      return reply.status(404).send({ error: true, message: 'Artifact not found' })
    }

    if (!canAccessArtifact(auth, artifact.appSlug)) {
      return reply.status(404).send({ error: true, message: 'Artifact not found' })
    }

    if (artifact.status !== 'completed') {
      return reply.status(409).send({ error: true, message: 'Artifact is not ready' })
    }

    let file: Awaited<ReturnType<typeof getArtifactFile>>
    try {
      file = await getArtifactFile(id)
    } catch (err) {
      app.log.warn({ err, artifactId: id }, 'Artifact file lookup failed')
      return reply.status(404).send({ error: true, message: 'Artifact file not found' })
    }

    if (!file) {
      return reply.status(404).send({ error: true, message: 'Artifact file not found' })
    }

    return reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `inline; filename="${file.filename}"`)
      .header('Cache-Control', 'private, max-age=3600')
      .send(file.buffer)
  })
}
